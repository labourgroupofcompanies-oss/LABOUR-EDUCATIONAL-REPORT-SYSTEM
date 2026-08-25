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

// v15 — adds payments store and updates classes schema to index category
db.version(15).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name, category',
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
  outbox: '++id, operation, table, schoolId, status, createdAt',
  payments: '++id, schoolId, learnerId, academicYear, term, synced, supabaseId, amount, paymentDate, paymentMethod, reference'
});

// v16 — adds photoUrl (indexed remote URL) to learners;
//        the actual binary Blob is stored in the non-indexed `photo` field.
//        This enables fast detection of URL changes during pull sync to decide
//        whether a fresh Blob download is needed.
db.version(16).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name, category',
  subjects: '++id, name, schoolId',
  profiles: 'id, schoolId, fullName, role, email',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status, photoUrl',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId, schoolId',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt, schoolId',
  classSubjects: '++id, classId, subjectId, schoolId',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId',
  outbox: '++id, operation, table, schoolId, status, createdAt',
  payments: '++id, schoolId, learnerId, academicYear, term, synced, supabaseId, amount, paymentDate, paymentMethod, reference'
});

// v19 — Enterprise Multi-Tenant composite indexes & audit logs
db.version(19).stores({
  schools: 'id, name, location, district, region, circuit',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent, [schoolId+isCurrent]',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name, category, [schoolId+name]',
  subjects: '++id, name, schoolId, [schoolId+name]',
  profiles: 'id, schoolId, fullName, role, email, [schoolId+role]',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status, photoUrl, [schoolId+status], [schoolId+currentClassId]',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId, schoolId, [schoolId+teacherId]',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt, schoolId, [schoolId+academicYear+term], [schoolId+learnerId], [schoolId+classId+subjectId]',
  classSubjects: '++id, classId, subjectId, schoolId, [schoolId+classId]',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased, [schoolId+academicYear+term], [schoolId+learnerId]',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at, [schoolId+created_at]',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced, [schoolId+parentPhone]',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId, [schoolId+parentPhone]',
  outbox: '++id, operation, table, schoolId, status, createdAt, [schoolId+status]',
  payments: '++id, schoolId, learnerId, academicYear, term, synced, supabaseId, amount, paymentDate, paymentMethod, reference, [schoolId+learnerId]',
  feeStructure: 'id, schoolId, academicYear, term, className, feeCategory, [schoolId+academicYear+term]',
  feeTransactions: 'id, clientTxId, schoolId, learnerId, receiptNumber, receiptStatus, transactionType, createdAt, [schoolId+learnerId]',
  paymentAllocations: 'id, transactionId, feeCategory',
  cashbookClosings: 'id, schoolId, closingDate, status, [schoolId+closingDate]',
  financialAuditLogs: 'id, schoolId, staffId, action, performedAt, [schoolId+performedAt]',
  auditLogs: 'id, schoolId, timestamp, userId, action, [schoolId+action]'
});

// v20 — Enterprise Referral & Rewards System (Event-Driven, Ledger & Fraud Engine)
db.version(20).stores({
  schools: 'id, name, location, district, region, circuit, referralCode, referredBySchoolId, referralLocked',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent, [schoolId+isCurrent]',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name, category, [schoolId+name]',
  subjects: '++id, name, schoolId, [schoolId+name]',
  profiles: 'id, schoolId, fullName, role, email, [schoolId+role]',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status, photoUrl, [schoolId+status], [schoolId+currentClassId]',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId, schoolId, [schoolId+teacherId]',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt, schoolId, [schoolId+academicYear+term], [schoolId+learnerId], [schoolId+classId+subjectId]',
  classSubjects: '++id, classId, subjectId, schoolId, [schoolId+classId]',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased, [schoolId+academicYear+term], [schoolId+learnerId]',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at, [schoolId+created_at]',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced, [schoolId+parentPhone]',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId, [schoolId+parentPhone]',
  outbox: '++id, operation, table, schoolId, status, createdAt, [schoolId+status]',
  payments: '++id, schoolId, learnerId, academicYear, term, synced, supabaseId, amount, paymentDate, paymentMethod, reference, [schoolId+learnerId]',
  feeStructure: 'id, schoolId, academicYear, term, className, feeCategory, [schoolId+academicYear+term]',
  feeTransactions: 'id, clientTxId, schoolId, learnerId, receiptNumber, receiptStatus, transactionType, createdAt, [schoolId+learnerId]',
  paymentAllocations: 'id, transactionId, feeCategory',
  cashbookClosings: 'id, schoolId, closingDate, status, [schoolId+closingDate]',
  financialAuditLogs: 'id, schoolId, staffId, action, performedAt, [schoolId+performedAt]',
  auditLogs: 'id, schoolId, timestamp, userId, action, [schoolId+action]',

  // Referral & Rewards Architecture Stores
  // Referral & Rewards Architecture Stores
  referrals: 'id, referrerSchoolId, referredSchoolId, referralCodeUsed, status, rewardAmount, welcomeBonusAmount, fraudScore, fraudFlag, createdAt, [referrerSchoolId+status], [referredSchoolId]',
  walletLedger: 'id, schoolId, type, amount, reference, sourceSchoolId, status, createdAt, [schoolId+type], [reference]',
  referralConfigs: 'id',
  referralAuditLogs: 'id, referralId, action, createdAt',
  fraudAnalysis: 'id, referralId, fraudScore, createdAt',
  systemEvents: '++id, eventName, processed, createdAt'
});

// v21 — adds First Term Free billing & trial termination columns to schools
db.version(21).stores({
  schools: 'id, name, location, district, region, circuit, referralCode, referredBySchoolId, referralLocked, is_first_term_free, first_term_free_terminated, initial_academic_year, initial_term',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent, [schoolId+isCurrent]',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name, category, [schoolId+name]',
  subjects: '++id, name, schoolId, [schoolId+name]',
  profiles: 'id, schoolId, fullName, role, email, [schoolId+role]',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status, photoUrl, [schoolId+status], [schoolId+currentClassId]',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId, schoolId, [schoolId+teacherId]',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt, schoolId, [schoolId+academicYear+term], [schoolId+learnerId], [schoolId+classId+subjectId]',
  classSubjects: '++id, classId, subjectId, schoolId, [schoolId+classId]',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased, [schoolId+academicYear+term], [schoolId+learnerId]',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at, [schoolId+created_at]',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced, [schoolId+parentPhone]',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId, [schoolId+parentPhone]',
  outbox: '++id, operation, table, schoolId, status, createdAt, [schoolId+status]',
  payments: '++id, schoolId, learnerId, academicYear, term, synced, supabaseId, amount, paymentDate, paymentMethod, reference, [schoolId+learnerId]',
  feeStructure: 'id, schoolId, academicYear, term, className, feeCategory, [schoolId+academicYear+term]',
  feeTransactions: 'id, clientTxId, schoolId, learnerId, receiptNumber, receiptStatus, transactionType, createdAt, [schoolId+learnerId]',
  paymentAllocations: 'id, transactionId, feeCategory',
  cashbookClosings: 'id, schoolId, closingDate, status, [schoolId+closingDate]',
  financialAuditLogs: 'id, schoolId, staffId, action, performedAt, [schoolId+performedAt]',
  auditLogs: 'id, schoolId, timestamp, userId, action, [schoolId+action]',
  referrals: 'id, referrerSchoolId, referredSchoolId, referralCodeUsed, status, rewardAmount, welcomeBonusAmount, fraudScore, fraudFlag, createdAt, [referrerSchoolId+status], [referredSchoolId]',
  walletLedger: 'id, schoolId, type, amount, reference, sourceSchoolId, status, createdAt, [schoolId+type], [reference]',
  fraudAnalysis: 'id, referralId, fraudScore, createdAt',
  systemEvents: '++id, eventName, processed, createdAt'
});

// v22 — adds recycleBin store for soft-deleted / recoverable records
db.version(22).stores({
  schools: 'id, name, location, district, region, circuit, referralCode, referredBySchoolId, referralLocked, is_first_term_free, first_term_free_terminated, initial_academic_year, initial_term',
  settings: 'id',
  academicYears: '++id, schoolId, name, isCurrent, [schoolId+isCurrent]',
  terms: '++id, academicYearId, name, status',
  classes: '++id, schoolId, name, category, [schoolId+name]',
  subjects: '++id, name, schoolId, [schoolId+name]',
  profiles: 'id, schoolId, fullName, role, email, [schoolId+role]',
  learners: '++id, schoolId, currentClassId, learnerId, regNumber, fullName, synced, supabaseId, status, photoUrl, [schoolId+status], [schoolId+currentClassId]',
  teacherAssignments: '++id, teacherId, classId, subjectId, termId, schoolId, [schoolId+teacherId]',
  scores: '++id, learnerId, classId, subjectId, termId, term, academicYear, isSubmitted, lastSyncedAt, schoolId, [schoolId+academicYear+term], [schoolId+learnerId], [schoolId+classId+subjectId]',
  classSubjects: '++id, classId, subjectId, schoolId, [schoolId+classId]',
  reportSummaries: '++id, schoolId, learnerId, classId, academicYear, term, synced, supabaseId, promotionStatus, isReleased, [schoolId+academicYear+term], [schoolId+learnerId]',
  parentAccounts: 'phone_number, password_hash, synced',
  announcements: '++id, title, content, synced, supabaseId, schoolId, created_at, [schoolId+created_at]',
  messages: '++id, schoolId, parentPhone, senderRole, content, created_at, isRead, supabaseId, synced, [schoolId+parentPhone]',
  notifications: '++id, schoolId, parentPhone, title, content, created_at, isRead, supabaseId, [schoolId+parentPhone]',
  outbox: '++id, operation, table, schoolId, status, createdAt, [schoolId+status]',
  payments: '++id, schoolId, learnerId, academicYear, term, synced, supabaseId, amount, paymentDate, paymentMethod, reference, [schoolId+learnerId]',
  feeStructure: 'id, schoolId, academicYear, term, className, feeCategory, [schoolId+academicYear+term]',
  feeTransactions: 'id, clientTxId, schoolId, learnerId, receiptNumber, receiptStatus, transactionType, createdAt, [schoolId+learnerId]',
  paymentAllocations: 'id, transactionId, feeCategory',
  cashbookClosings: 'id, schoolId, closingDate, status, [schoolId+closingDate]',
  financialAuditLogs: 'id, schoolId, staffId, action, performedAt, [schoolId+performedAt]',
  auditLogs: 'id, schoolId, timestamp, userId, action, [schoolId+action]',
  referrals: 'id, referrerSchoolId, referredSchoolId, referralCodeUsed, status, rewardAmount, welcomeBonusAmount, fraudScore, fraudFlag, createdAt, [referrerSchoolId+status], [referredSchoolId]',
  walletLedger: 'id, schoolId, type, amount, reference, sourceSchoolId, status, createdAt, [schoolId+type], [reference]',
  referralConfigs: 'id',
  referralAuditLogs: 'id, referralId, action, createdAt',
  fraudAnalysis: 'id, referralId, fraudScore, createdAt',
  systemEvents: '++id, eventName, processed, createdAt',
  recycleBin: '++id, schoolId, entityType, entityId, entityName, deletedAt, expiresAt, synced, supabaseId, [schoolId+entityType]'
});

export default db;



