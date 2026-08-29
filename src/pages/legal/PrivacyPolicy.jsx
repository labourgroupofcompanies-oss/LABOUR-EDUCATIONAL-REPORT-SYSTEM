import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#09090b', color: '#FAFAFA', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Navigation Bar */}
      <header style={{
        height: '64px',
        borderBottom: '1px solid #27272a',
        background: 'rgba(9, 9, 11, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: 900,
            fontSize: '1.1rem'
          }}>
            L
          </div>
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#FFFFFF' }}>
              Labour Educational Report System
            </div>
            <div style={{ fontSize: '0.68rem', color: '#60A5FA', fontWeight: 800, letterSpacing: '0.06em' }}>
              LEGAL &amp; PRIVACY COMPLIANCE
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '8px',
            background: '#18181b',
            border: '1px solid #27272a',
            color: '#E4E4E7',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <i className="fas fa-arrow-left"></i>
          Back
        </button>
      </header>

      {/* Main Content Container */}
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '3.5rem 1.5rem 6rem 1.5rem' }}>
        {/* Header Badge & Title */}
        <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.35rem 0.85rem',
            borderRadius: '999px',
            background: 'rgba(37, 99, 235, 0.2)',
            border: '1px solid rgba(37, 99, 235, 0.4)',
            color: '#60A5FA',
            fontSize: '0.75rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '1rem'
          }}>
            <i className="fas fa-shield-halved"></i> Data Protection &amp; Legal Framework
          </span>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.4rem', fontWeight: 900, margin: '0 0 0.75rem 0', color: '#FFFFFF', letterSpacing: '-0.02em' }}>
            Privacy Policy &amp; Terms of Data Protection
          </h1>
          <p style={{ color: '#A1A1AA', fontSize: '0.95rem', maxWidth: '680px', margin: '0 auto', lineHeight: 1.6 }}>
            Compliance with the <strong>Ghana Data Protection Act, 2012 (Act 843)</strong>, Ministry of Education, Ghana Education Service (GES) Guidelines, and International Child Data Safety Standards.
          </p>
          <div style={{ fontSize: '0.78rem', color: '#71717a', marginTop: '1rem' }}>
            Effective Date: <strong>August 2026</strong> · Version: <strong>2.4 (Enterprise Edition)</strong> · Legal Entity: <strong>Labour Group of Companies</strong>
          </div>
        </div>

        {/* Legal Notice Card */}
        <div style={{
          background: 'rgba(37, 99, 235, 0.08)',
          border: '1px solid rgba(37, 99, 235, 0.25)',
          borderRadius: '16px',
          padding: '1.5rem',
          marginBottom: '2.5rem',
          color: '#DBEAFE',
          lineHeight: 1.6,
          fontSize: '0.88rem'
        }}>
          <strong style={{ color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.5rem', fontSize: '0.95rem' }}>
            <i className="fas fa-circle-info" style={{ color: '#60A5FA' }}></i> Executive Summary for School Administrators &amp; Parents:
          </strong>
          Labour Educational Report System is built on an <strong>Offline-First, Zero-Knowledge Encryption Model</strong>. Student academic marks, personal data, and headteacher signatures belong exclusively to your school. We do not sell, rent, monetize, or disclose student or teacher data to third-party advertisers under any circumstances.
        </div>

        {/* Policy Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.25rem', lineHeight: 1.75, color: '#D4D4D8', fontSize: '0.92rem' }}>
          
          {/* Section 1 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>1</span>
              Legal Framework &amp; Institutional Roles
            </h2>
            <p>
              This Privacy Policy governs the access, collection, storage, and processing of institutional and personal data within the <strong>Labour Educational Report System</strong> (hereinafter referred to as the <em>"Platform"</em>, <em>"Software"</em>, or <em>"Service"</em>), operated by <strong>Labour Group of Companies</strong> (hereinafter referred to as the <em>"Company"</em> or <em>"Platform Provider"</em>).
            </p>
            <p>
              In accordance with the <strong>Ghana Data Protection Act, 2012 (Act 843)</strong>:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0' }}>
              <li><strong>The School (Educational Institution)</strong> acts as the sole <strong>Data Controller</strong>. The school determines the purposes for which and the manner in which student, teacher, and guardian personal data is collected and processed.</li>
              <li><strong>Labour Group of Companies</strong> acts strictly as the <strong>Data Processor</strong>. The Company processes academic, administrative, and financial ledger data solely on behalf of, and under the explicit authorization of, the Data Controller.</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>2</span>
              Categories of Data Collected &amp; Processed
            </h2>
            <p>The Platform collects and maintains only the necessary categories of data required to generate official GES-compliant terminal reports and facilitate school administration:</p>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ background: '#18181b', padding: '1rem', borderRadius: '12px', border: '1px solid #27272a' }}>
                <div style={{ color: '#60A5FA', fontWeight: 800, marginBottom: '0.4rem' }}>👨‍🎓 Learner Data</div>
                <div style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>
                  Full legal name, Student ID, gender, date of birth, class assignment, Ghanaian language studied, passport photograph, continuous assessment scores (CA 30%/50%), exam scores (70%/50%), attendance totals, conduct and attitude remarks.
                </div>
              </div>

              <div style={{ background: '#18181b', padding: '1rem', borderRadius: '12px', border: '1px solid #27272a' }}>
                <div style={{ color: '#34D399', fontWeight: 800, marginBottom: '0.4rem' }}>👨‍👩‍👧 Parent &amp; Guardian Data</div>
                <div style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>
                  Guardian name, primary mobile telephone number, emergency contact details, Parent Portal verification tokens, and terminal bill receipts.
                </div>
              </div>

              <div style={{ background: '#18181b', padding: '1rem', borderRadius: '12px', border: '1px solid #27272a' }}>
                <div style={{ color: '#FBBF24', fontWeight: 800, marginBottom: '0.4rem' }}>🏫 School &amp; Staff Data</div>
                <div style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>
                  Official school name, school crest/emblem, circuit, district, region, headteacher full name, digital signature vector/image, teacher staff IDs, assigned subjects, and login credentials.
                </div>
              </div>

              <div style={{ background: '#18181b', padding: '1rem', borderRadius: '12px', border: '1px solid #27272a' }}>
                <div style={{ color: '#C084FC', fontWeight: 800, marginBottom: '0.4rem' }}>💳 Financial &amp; Wallet Data</div>
                <div style={{ fontSize: '0.82rem', color: '#A1A1AA' }}>
                  School wallet balances, Mobile Money (MTN, Telecel, AT) transaction references, term payment logs, and Paystack verification receipts. <em>(Note: We never store card CVV or Mobile Money PINs).</em>
                </div>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>3</span>
              Protection of Children &amp; Minor Records
            </h2>
            <p>
              Given that student data represents records of minors, the Platform operates in strict compliance with the <strong>Children's Act (Act 560)</strong>, <strong>Data Protection Act (Act 843, Section 37)</strong>, and international standards (COPPA/GDPR-K):
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0' }}>
              <li><strong>Parental Consent Delegation:</strong> The school warrants that upon registering a learner, it has obtained lawful consent from the child's parent or legal guardian under its institutional enrollment agreement.</li>
              <li><strong>Restricted Visibility:</strong> A student's terminal report is accessible exclusively to that student's registered school staff and verified parents holding that child's direct access credentials.</li>
              <li><strong>No Behavioral Profiling:</strong> Student assessment data is never used for automated psychological profiling, targeted marketing, or commercial evaluation.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>4</span>
              Offline-First Storage, Dexie Indexing &amp; Cloud Security
            </h2>
            <p>
              The Software utilizes an advanced offline-first engine designed to protect data during network outages:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0' }}>
              <li><strong>Local Sandboxing:</strong> Offline marks and rosters are stored within the browser's protected IndexedDB storage (Dexie) isolated strictly to the user's specific domain origin.</li>
              <li><strong>Encryption in Transit:</strong> All data synchronized between user devices and the cloud is protected with <strong>TLS 1.3 encryption</strong> with strict HTTPS transport security.</li>
              <li><strong>Cloud Isolation via Row-Level Security (RLS):</strong> The central database (Supabase/PostgreSQL) enforces cryptographically signed Row-Level Security policies. No school, teacher, or external party can query or access records belonging to another educational institution.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>5</span>
              Headteacher Digital Signatures &amp; QR Verification
            </h2>
            <p>
              The Platform provides a digital signature capture and verification system:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0' }}>
              <li><strong>Signature Authority:</strong> The school Headteacher is solely responsible for authorizing and uploading their digital signature. The Platform applies this signature to report cards strictly based on the school's configured release parameters.</li>
              <li><strong>Verification QR Codes:</strong> Each generated report card embeds a cryptographic verification QR code. Scanning this code directs to the public receipt/report validation page, validating the document against counterfeit alterations without exposing confidential pupil records.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>6</span>
              Financial Processing &amp; Third-Party Intermediaries
            </h2>
            <p>
              School wallet deposits, Mobile Money payments, and subscription activations are executed via licensed payment processors:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0' }}>
              <li><strong>Paystack Payment Gateway:</strong> Card and Mobile Money transactions are handled securely by Paystack (a PCI-DSS Level 1 certified processor) and telecommunication networks (MTN, Telecel, AirtelTigo).</li>
              <li><strong>Non-Retention of Payment Credentials:</strong> The Platform Provider never receives, handles, or stores banking passwords, debit card CVVs, or Mobile Money PINs.</li>
              <li><strong>Gateway Non-Liability:</strong> The Platform is not liable for transaction delays or network downtime caused by external telecommunication network operators or banking switches.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>7</span>
              Data Retention, 30-Day Recycle Bin &amp; Right to Erasure
            </h2>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0' }}>
              <li><strong>30-Day Safety Window (Recycle Bin):</strong> When a student or teacher profile is deleted by school staff, it is placed in an encrypted soft-delete holding bin for 30 calendar days to prevent catastrophic accidental data loss. During this period, the school Headteacher can restore the profile and historical marks.</li>
              <li><strong>Permanent Erasure:</strong> Following the 30-day window, or upon written request by the School Data Controller, records are permanently expunged from primary storage and live databases.</li>
            </ul>
          </section>

          {/* Section 8 - Founder & Company Limitation of Liability */}
          <section style={{
            background: 'linear-gradient(135deg, #18181b 0%, #1f1f28 100%)',
            border: '1.5px solid #3f3f46',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#DC2626', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>8</span>
              Limitation of Liability &amp; Founder Indemnification
            </h2>
            <p style={{ color: '#E4E4E7', fontWeight: 600 }}>
              To the fullest extent permitted by the laws of Ghana and international commercial law:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0', color: '#D4D4D8' }}>
              <li><strong>Accuracy of Marks &amp; Assessment Computation:</strong> The Platform computes letter grades, remarks, and averages strictly based on formulas selected by the school. The Platform Provider, Founder, and Developers shall not be liable for erroneous marks entered by teachers, incorrect grading boundary setup, or pedagogical disputes between schools and parents.</li>
              <li><strong>School Internal Disputes &amp; Staff Misuse:</strong> The School is responsible for managing staff access credentials. The Platform Provider shall not be held liable for unauthorized actions taken by authorized school personnel (e.g., unauthorized student deletions, marks manipulation by a teacher, or premature release of reports).</li>
              <li><strong>Hardware &amp; Local Device Security:</strong> Users are responsible for securing the physical devices (laptops, phones, tablets) on which offline marks are stored. The Company is not responsible for data accessed due to unencrypted, stolen, or shared physical devices.</li>
              <li><strong>Aggregate Liability Cap:</strong> In any event, the aggregate liability of the Platform Provider and Founder arising out of the software service shall not exceed the total subscription fees paid by the respective educational institution during the preceding twelve (12) month period.</li>
            </ul>
          </section>

          {/* Section 9 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>9</span>
              Governing Law &amp; Dispute Resolution
            </h2>
            <p>
              This Privacy Policy and all associated service agreements shall be governed by, construed, and enforced in accordance with the <strong>laws of the Republic of Ghana</strong>. Any dispute arising from or related to data protection under this Policy shall be settled through amicable conciliation with the <strong>Ghana Data Protection Commission (DPC)</strong> before seeking legal redress in the courts of Ghana.
            </p>
          </section>

          {/* Section 10 */}
          <section style={{ background: '#121217', border: '1px solid #222226', borderRadius: '16px', padding: '1.75rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: '#2563eb', color: '#FFFFFF', width: '28px', height: '28px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>10</span>
              Contact Information &amp; Data Protection Officer
            </h2>
            <p>For questions, data rectification requests, or regulatory inquiries, contact the designated Data Protection Desk:</p>
            <div style={{ background: '#18181b', padding: '1.25rem', borderRadius: '12px', border: '1px solid #27272a', marginTop: '0.75rem', fontSize: '0.88rem' }}>
              <div>🏢 <strong>Entity:</strong> Labour Educational Report System (Labour Group of Companies)</div>
              <div style={{ marginTop: '4px' }}>📧 <strong>Official Email:</strong> privacy@labouredu.com / support@labouredu.com</div>
              <div style={{ marginTop: '4px' }}>📞 <strong>Support Desk &amp; WhatsApp:</strong> +233 54 182 9724 (0541829724)</div>
              <div style={{ marginTop: '4px' }}>🌐 <strong>Official Website:</strong> <a href="https://labouredu.com" target="_blank" rel="noreferrer" style={{ color: '#60A5FA', textDecoration: 'none' }}>labouredu.com</a></div>
              <div style={{ marginTop: '4px' }}>📍 <strong>Jurisdiction:</strong> Greater Accra / Ashanti Region, Ghana</div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '4rem', textAlign: 'center', borderTop: '1px solid #27272a', paddingTop: '2rem', color: '#71717a', fontSize: '0.82rem' }}>
          <div>© 2026 Labour Group of Companies. All Rights Reserved.</div>
          <div style={{ marginTop: '4px' }}>Certified GES Curriculum Compliant &amp; Act 843 Aligned Educational Platform</div>
        </div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;
