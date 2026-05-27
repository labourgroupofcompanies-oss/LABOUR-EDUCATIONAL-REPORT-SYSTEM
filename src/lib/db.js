import Dexie from 'dexie';

export const db = new Dexie('LabourEduReportSystem_v1');

// Define database schema
// v2 — base schema
db.version(2).stores({
  schools: 'id, name, location',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, fullName',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, isSubmitted, lastSyncedAt'
});

// v3 — adds regNumber, photo, supabaseId & synced to learners
db.version(3).stores({
  schools: 'id, name, location',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, isSubmitted, lastSyncedAt'
});

// v4 — adds district, region, circuit to schools
db.version(4).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, isSubmitted, lastSyncedAt'
});

// v5 — adds classSubjects store for managing subjects assigned to classes
db.version(5).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId'
});

// v6 — adds reportSummaries store for managing termly student reports
db.version(6).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId'
});

// v7 — adds academicYear and term to scores store for proper filtering by term and year
db.version(7).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId'
});

// v8 — adds status to learners (Active/Alumni) and promotionStatus to reportSummaries
db.version(8).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus'
});

// v9 — adds parentAccounts and announcements for Parent Portal
db.version(9).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at'
});

// v10 — adds messages store for parent ↔ head-teacher text chat
db.version(10).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced'
});

// v11 — adds notifications store for broadcast + targeted parent alerts
db.version(11).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId'
});

// v12 — adds isReleased to reportSummaries for Parent Portal visibility control
db.version(12).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId'
});

// v13 — adds outbox table for structured offline sync queue
db.version(13).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId',
  outbox: '++id, operation, table, schoolId, status, createdAt'
});

// v14 — adds schoolId index to subjects, teacherAssignments, and scores for optimized querying and reactivity
db.version(14).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name',
  subjects: '++id, name, schoolId',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId, schoolId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt, schoolId',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId',
  outbox: '++id, operation, table, schoolId, status, createdAt'
});

export default db;


