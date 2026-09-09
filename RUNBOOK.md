# Labour Educational Report System — Operational Runbook

**System Version:** 0.1.1  
**Target Environment:** Production / Netlify / Supabase / Dexie (PWA)  
**Last Updated:** September 2026  

---

## Table of Contents
1. [System Architecture & Overview](#1-system-architecture--overview)
2. [Multi-Tenant Data Model & School Isolation](#2-multi-tenant-data-model--school-isolation)
3. [Offline-First Sync Engine Architecture](#3-offline-first-sync-engine-architecture)
4. [Deployment & Release Procedures](#4-deployment--release-procedures)
5. [Operational Playbooks (Standard Procedures)](#5-operational-playbooks-standard-procedures)
6. [Incident Response & Troubleshooting Guide](#6-incident-response--troubleshooting-guide)
7. [Database Schema & Table Reference](#7-database-schema--table-reference)
8. [Emergency Contacts & Escalation](#8-emergency-contacts--escalation)

---

## 1. System Architecture & Overview

The Labour Educational Report System is an **offline-first, multi-tenant Progressive Web App (PWA)** built for primary and junior high schools in Ghana to record scores, manage learners, generate GES-standard terminal reports, and send parent SMS/notifications.

### Core Stack:
- **Frontend / Client:** React 18 (Vite, PWA with Workbox service worker, Tailwind CSS / Vanilla CSS modules).
- **Client Database:** Dexie.js (IndexedDB `LabourEduReportSystem_v1`) stores local learners, scores, report summaries, classes, subjects, and sync outbox.
- **Backend / Cloud:** Supabase (PostgreSQL 15 + Row-Level Security, Auth, Storage, Edge Functions, RPCs).
- **Hosting:** Netlify (Automated CI/CD via GitHub `main` branch).
- **Payments:** Paystack integration for subscriptions and SMS wallet top-ups.

```
┌─────────────────────────────────────────────────────────────┐
│                       CLIENT BROWSER                        │
│                                                             │
│   React UI (LearnerList, ScoreEntry, Reports, Dashboard)    │
│                           │                                 │
│                     Dexie.js (IndexedDB)                    │
│   (learners, classes, scores, summaries, outbox, etc.)      │
│                           ▲                                 │
│                           │                                 │
│                  SyncEngine / SyncDown                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ (HTTPS / WebSockets)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     SUPABASE (CLOUD)                        │
│                                                             │
│   PostgreSQL (Row Level Security enforced by school_id JWT) │
│   - report_schools, report_learners, report_scores, etc.    │
│   Supabase Storage (learner-photos, logos)                  │
│   Supabase Auth (JWT metadata: role, school_id)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Multi-Tenant Data Model & School Isolation

### Critical Tenancy Rule:
All tables in Supabase and IndexedDB are shared across multiple schools. **Every record must carry a `school_id` / `schoolId` foreign key.**

### Security & Isolation Layers:
1. **Supabase Row-Level Security (RLS):**
   - RLS checks `WITH CHECK (school_id = public.jwt_school_id())`.
   - Any attempt to write or mutate records belonging to a different school is rejected with `HTTP 403 Forbidden` (`42501`).
2. **Dexie Local Query Scoping:**
   - Always query using `.filter(r => String(r.schoolId) === String(user.schoolId) || String(r.school_id || '') === String(user.schoolId))` or `.where('schoolId').equals(user.schoolId)`.
   - **Never query without school filtering** (e.g. `db.learners.where('currentClassId').equals(...)` is strictly forbidden because class IDs 1, 2, 3 collide across schools).
3. **Foreign Key Firewall (`syncEngine.js`):**
   - Automatically drops or rejects any outbox item attempting to insert a score or student where local `schoolId !== targetSchoolId`.

---

## 3. Offline-First Sync Engine Architecture

The sync engine handles bi-directional data transfer between Dexie and Supabase.

### Outbound Sync (Local → Cloud): `syncEngine.js`
1. When a user creates/edits learners or scores, changes are written to Dexie immediately.
2. An entry is created in `db.outbox` (`operation: 'insert' | 'update' | 'delete' | 'delete_insert'`).
3. `drainOutbox()` runs periodically and when online:
   - Filters outbox entries **only for the active school session** (`item.schoolId === currentSchoolId`).
   - Resolves local integer IDs to cloud UUIDs via `resolveScoresForeignKeys()`.
   - Submits payloads to Supabase.
   - On success: removes item from `db.outbox`.
   - On `403 Forbidden` / RLS boundary violation: permanently drops the toxic item to prevent sync loops.

### Inbound Sync (Cloud → Local): `syncDown.js`
1. Runs on login and background intervals (`startAdminSync(user)`).
2. Pulls remote schools, classes, subjects, class-subject assignments, staff, learners, and scores.
3. Reconciles local Dexie records:
   - Matches learners **strictly scoped to `schoolId`**.
   - Preserves offline-pending local edits via dirty guards (`hasPendingOutbox`).
   - Merges cloud UUIDs into local records.

---

## 4. Deployment & Release Procedures

### Code Repository & Branches:
- **Repository:** `labour-edu-report-system`
- **Production Branch:** `main`
- **Deploy Pipeline:** Netlify pushes on commit to `main`.

### Pre-Deployment Verification:
Before pushing any code, always run a full production build locally:
```cmd
cd "c:\Users\MR. RAY\Desktop\labour Edu Report System"
npm run build
```
Ensure build exits with `✓ built in ...` and 0 errors.

### Standard Push Deployment:
```cmd
git add .
git commit -m "feat/fix: <clear description of change>"
git push origin main
```

---

## 5. Operational Playbooks (Standard Procedures)

### Playbook A: Onboarding a New School
1. Admin registers new school at `/onboarding`.
2. Supabase trigger provisions `report_schools` row with generated ID (e.g. `SCH-G3798`).
3. Admin sets up:
   - School classes (Creche to JHS 3).
   - Subjects offered.
   - Grading scale and terminal settings.
4. Verify school ID is stamped in Supabase Auth user metadata (`user.user_metadata.school_id`).

### Playbook B: Resetting Local Cache (Clean Client Sync)
If a user switched schools on a shared browser and local IndexedDB holds obsolete rows:
1. Open Chrome / Edge DevTools (**F12**).
2. Select **Application** tab → **Storage**.
3. Click **"Clear site data"**.
4. Refresh browser and log back in. The app will pull a clean, genuine dataset directly from Supabase.

---

## 6. Incident Response & Troubleshooting Guide

### Incident 1: `403 (Forbidden)` Loop on `POST /report_learners` or `report_scores`
- **Symptoms:** Continuous console red error `POST ... 403 (Forbidden)`, sync indicator spinning indefinitely.
- **Root Cause:** An outbox item contains a learner or score whose `school_id` differs from the currently authenticated user's JWT `school_id`.
- **Resolution:**
  - Automated self-heal runs on app startup (`SyncEngineProvider.jsx`) and clears 403 items.
  - If immediate fix is needed in console:
    ```javascript
    await db.outbox.filter(o => o.status === 'failed' || String(o.errorMessage).includes('403')).delete();
    ```

### Incident 2: Cross-School Learner Contamination
- **Symptoms:** School A logs in and sees students from School B in learner list or score entry.
- **Root Cause:** Unscoped query in frontend, or `syncDown.js` lookup matched students by name without checking `schoolId`.
- **Resolution:**
  - Verify all queries use `tenantGuard.js` or include `schoolId` filter.
  - `SyncEngineProvider.jsx` includes auto-repair on startup to check for misattributed registration number prefixes (`MRR`, `KGM`) and safely restores or deduplicates them.

### Incident 3: Offline Scores Not Uploading After Reconnection
- **Symptoms:** Scores saved offline show green badge locally but never reach cloud database.
- **Root Cause:** Learner was created offline and has not yet received a Supabase UUID (`supabaseId`). Score sync requires UUID foreign key.
- **Resolution:**
  - Once the device reconnects, the sync engine prioritizes syncing `report_learners` first.
  - As soon as the learner receives `supabaseId`, `reconcileInsertedRow` cascades the UUID to pending scores and drains the score batch.

---

## 7. Database Schema & Table Reference

| Local Dexie Table | Supabase Table | Key Fields | Description |
|---|---|---|---|
| `schools` | `report_schools` | `id`, `name`, `currentAcademicYear`, `currentTerm` | School profile & configuration |
| `classes` | `report_classes` | `id`, `schoolId`, `name` | Grade/class levels |
| `subjects` | `report_subjects` | `id`, `schoolId`, `name` | Curricular subjects |
| `classSubjects` | `report_class_subjects` | `id`, `classId`, `subjectId`, `schoolId` | Subjects linked to classes |
| `profiles` | `report_profiles` | `id`, `schoolId`, `role`, `email` | Staff and admin profiles |
| `learners` | `report_learners` | `id`, `schoolId`, `currentClassId`, `regNumber`, `supabaseId` | Student roster |
| `scores` | `report_scores` | `id`, `schoolId`, `learnerId`, `classId`, `subjectId`, `examScore` | Assessment scores |
| `reportSummaries` | `report_summaries` | `id`, `schoolId`, `learnerId`, `classId`, `academicYear`, `term` | Term aggregates, positions, remarks |
| `outbox` | N/A (Client only) | `id`, `table`, `operation`, `payload`, `status`, `schoolId` | Offline mutation queue |

---

## 8. Emergency Contacts & Escalation

- **Platform Lead / Developer:** MR. RAY / System Administrator
- **Supabase Cloud Dashboard:** [https://supabase.com/dashboard/project/qyavwtumduldesrajvzm](https://supabase.com/dashboard/project/qyavwtumduldesrajvzm)
- **Netlify Hosting Dashboard:** [https://app.netlify.com/](https://app.netlify.com/)
- **Paystack Live Dashboard:** [https://dashboard.paystack.com/](https://dashboard.paystack.com/)
