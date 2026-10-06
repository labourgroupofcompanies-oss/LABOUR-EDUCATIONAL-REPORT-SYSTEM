import React from 'react';
import { useNavigate } from 'react-router-dom';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', color: '#0F172A', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Header Bar */}
      <header style={{
        height: '64px',
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 1.5rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
      }}>
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} 
          onClick={() => navigate('/')}
          title="Return to Home"
        >
          <img
            src="/app-icon.png"
            alt="Labour Logo"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              objectFit: 'contain',
              background: '#F1F5F9',
              border: '1px solid #E2E8F0',
              padding: '2px'
            }}
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/logo.png';
            }}
          />
          <div>
            <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.05rem', color: '#0F172A', lineHeight: 1.2 }}>
              Labour Educational Report System
            </div>
            <div style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 700, letterSpacing: '0.04em' }}>
              PRIVACY POLICY &amp; DATA PROTECTION
            </div>
          </div>
        </div>

        <button
          onClick={handleBack}
          style={{
            padding: '0.45rem 0.95rem',
            borderRadius: '10px',
            background: '#F1F5F9',
            border: '1px solid #CBD5E1',
            color: '#1E293B',
            fontSize: '0.85rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#E2E8F0'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#F1F5F9'}
        >
          <i className="fas fa-arrow-left"></i>
          Back
        </button>
      </header>

      {/* Main Content Area */}
      <main style={{ maxWidth: '860px', margin: '0 auto', padding: '2.5rem 1.25rem 5rem 1.25rem' }}>
        
        {/* Title Header Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '20px',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
          marginBottom: '2rem'
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0.35rem 0.85rem',
            borderRadius: '999px',
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1D4ED8',
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            marginBottom: '1rem'
          }}>
            <i className="fas fa-shield-halved"></i> Plain English Privacy Guide
          </span>

          <h1 style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: 'clamp(1.75rem, 4vw, 2.4rem)',
            fontWeight: 900,
            color: '#0F172A',
            margin: '0 0 0.85rem 0',
            letterSpacing: '-0.02em',
            lineHeight: 1.2
          }}>
            Privacy Policy &amp; How We Protect Your School Data
          </h1>

          <p style={{
            color: '#475569',
            fontSize: '1rem',
            maxWidth: '680px',
            margin: '0 auto',
            lineHeight: 1.6
          }}>
            We believe privacy policies should be simple, transparent, and easy to understand. 
            This document explains how your school, teacher, and student information is kept safe, private, and secure.
          </p>

          <div style={{
            marginTop: '1.25rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #F1F5F9',
            fontSize: '0.8rem',
            color: '#64748B',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}>
            <span>Last Updated: <strong>September 2026</strong></span>
            <span>&bull;</span>
            <span>Applicable to: <strong>Schools, Teachers, Learners &amp; Parents</strong></span>
            <span>&bull;</span>
            <span>Compliance: <strong>Ghana Data Protection Act (Act 843)</strong></span>
          </div>
        </div>

        {/* Quick Highlights Summary Card */}
        <div style={{
          background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 100%)',
          borderRadius: '16px',
          padding: '1.75rem',
          color: '#FFFFFF',
          marginBottom: '2rem',
          boxShadow: '0 10px 25px rgba(37, 99, 235, 0.2)'
        }}>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: '1.2rem',
            fontWeight: 800,
            margin: '0 0 0.85rem 0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <i className="fas fa-lock"></i> Our 4 Core Privacy Promises to You
          </h2>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.35rem' }}>1. Your School Owns All Data</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.95, lineHeight: 1.5 }}>
                Your student grades, marks, and records belong solely to your school. We never claim ownership.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.35rem' }}>2. No Ads, No Data Selling</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.95, lineHeight: 1.5 }}>
                We never sell, rent, or trade pupil or parent phone numbers to advertisers or marketing companies.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.35rem' }}>3. Isolated School Records</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.95, lineHeight: 1.5 }}>
                No school can ever see or access another school's learners, staff list, exam marks, or finances.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.12)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.35rem' }}>4. Safe Mobile Money &amp; Payments</div>
              <div style={{ fontSize: '0.82rem', opacity: 0.95, lineHeight: 1.5 }}>
                We never see or save your Mobile Money PIN or bank card security code (CVV). Payments are handled by licensed banks.
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Sections List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Section 1 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>1</span>
              Who We Are &amp; What This System Does
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 0.75rem 0' }}>
              The <strong>Labour Educational Report System</strong> is an educational software platform operated by <strong>Labour Group of Companies</strong> in Ghana. 
              Our software helps basic schools, headteachers, and teachers enter student continuous assessment scores, calculate terminal exam grades, produce GES-compliant report cards, and communicate with parents.
            </p>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: 0 }}>
              Under Ghanaian law (the <em>Data Protection Act, 2012</em>), your school is the official owner and controller of all student records. We act as your secure digital service provider, storing and processing records strictly as instructed by your school.
            </p>
          </section>

          {/* Section 2 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>2</span>
              What Information Is Kept in the System
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 1rem 0' }}>
              We only hold the minimum information needed to generate student report cards and manage school operations:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div style={{ background: '#F8FAFC', padding: '1.15rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#1D4ED8', fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-user-graduate"></i> Student Records
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
                  Student name, identification code, gender, date of birth, class, passport photo (if provided by the school), attendance, class test marks, and exam scores.
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '1.15rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#047857', fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-users"></i> Parent &amp; Guardian Info
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
                  Parent or guardian name, mobile phone number for sending terminal report links, and receipt summaries.
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '1.15rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#B45309', fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-school"></i> School &amp; Staff Details
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
                  Official school name, crest or logo, district, circuit, teacher staff names, assigned subjects, and login email accounts.
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '1.15rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div style={{ color: '#6D28D9', fontWeight: 800, fontSize: '0.92rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fas fa-receipt"></i> School Payment Receipts
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', lineHeight: 1.55 }}>
                  Records of school wallet top-ups and report generation receipts. We never record or keep Mobile Money PINs or debit card security codes.
                </div>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>3</span>
              How Your Information Is Used
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 0.75rem 0' }}>
              All information stored in the system is used strictly to provide you with school reporting tools:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0', color: '#334155', lineHeight: 1.7, fontSize: '0.92rem' }}>
              <li><strong>To generate report cards:</strong> Calculating class scores, overall exam marks, positions, and teacher comments.</li>
              <li><strong>To notify parents:</strong> Giving parents direct access to check their child's terminal performance securely on mobile devices.</li>
              <li><strong>To safeguard school records:</strong> Ensuring that student historical records remain available for future academic reference, transfers, and transcripts.</li>
              <li><strong>To assist school administrators:</strong> Helping headteachers audit academic performance across various classes and subjects.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>4</span>
              Special Protection for Children and Learners
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 0.75rem 0' }}>
              Because our system handles school records of children, we apply the highest safety standards:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0', color: '#334155', lineHeight: 1.7, fontSize: '0.92rem' }}>
              <li><strong>Strict Access Control:</strong> Only authorized teachers from that specific school and verified parents can view a child's results.</li>
              <li><strong>No Public Profiles:</strong> Student data is never indexed on public search engines like Google or made publicly searchable.</li>
              <li><strong>Official School Enrollment:</strong> Students are registered only through their school's authorized headteacher or designated administrative staff.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>5</span>
              How We Keep Your Data Safe &amp; Secure
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 0.75rem 0' }}>
              We use modern security practices to protect all school records:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0', color: '#334155', lineHeight: 1.7, fontSize: '0.92rem' }}>
              <li><strong>Encrypted Connections:</strong> Whenever you enter marks or open reports, data is transmitted over secure, encrypted channels (HTTPS) to prevent interception.</li>
              <li><strong>Offline Protection:</strong> When working without internet access, your marks are saved safely on your device and automatically synced once you reconnect.</li>
              <li><strong>Strict Isolation:</strong> Built-in security guards ensure each school's records are completely separated. No other school can access your school's information.</li>
              <li><strong>QR Verification on Reports:</strong> Official report sheets include a verification code so parents and institutions can verify their authenticity without exposing confidential marks to unauthorized persons.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>6</span>
              Your Rights and Control Over Your Data
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 0.75rem 0' }}>
              Schools and parents have complete control over their information:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0', color: '#334155', lineHeight: 1.7, fontSize: '0.92rem' }}>
              <li><strong>Right to Correct:</strong> If a student's name, class, or score has an error, authorized teachers or headteachers can update it immediately.</li>
              <li><strong>Accidental Deletion Protection:</strong> If a learner is deleted by mistake, the system holds the record safely in a 30-day Recycle Bin so the headteacher can easily restore it.</li>
              <li><strong>Right to Export or Delete:</strong> A school can download its student summaries and reports at any time, or request complete removal of its account if it stops using the service.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            padding: '1.75rem',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#EFF6FF',
                color: '#2563EB',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>7</span>
              Payments &amp; Financial Security
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 0.75rem 0' }}>
              When topping up your school SMS wallet or subscribing:
            </p>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.75rem 0', color: '#334155', lineHeight: 1.7, fontSize: '0.92rem' }}>
              <li>All payments are handled by certified, licensed payment gateways (such as Paystack) and telecom providers (MTN Mobile Money, Telecel Cash, AirtelTigo Money).</li>
              <li>We never ask you for your Mobile Money secret PIN or bank password. Never share your PIN with anyone, including school staff or support representatives.</li>
              <li>Your school will always receive an electronic receipt for any successful transaction.</li>
            </ul>
          </section>

          {/* Section 8 - Contact Information */}
          <section style={{
            background: '#F8FAFC',
            border: '1.5px solid #CBD5E1',
            borderRadius: '16px',
            padding: '1.75rem'
          }}>
            <h2 style={{
              fontFamily: 'Outfit, sans-serif',
              fontSize: '1.25rem',
              fontWeight: 800,
              color: '#0F172A',
              margin: '0 0 0.85rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{
                background: '#2563EB',
                color: '#FFFFFF',
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                fontWeight: 900
              }}>8</span>
              Need Help or Have Questions? Contact Us
            </h2>
            <p style={{ color: '#334155', lineHeight: 1.7, fontSize: '0.92rem', margin: '0 0 1rem 0' }}>
              If you have any questions about this Privacy Policy or need help with your school's data, our support team is ready to assist you:
            </p>

            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '1.25rem',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1rem',
              fontSize: '0.9rem',
              color: '#1E293B'
            }}>
              <div>
                <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                  Company Name
                </div>
                <strong>Labour Educational Report System</strong>
                <div style={{ fontSize: '0.8rem', color: '#64748B' }}>Labour Group of Companies</div>
              </div>

              <div>
                <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                  Support Email
                </div>
                <a href="mailto:support@labouredu.com" style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 700 }}>
                  support@labouredu.com
                </a>
              </div>

              <div>
                <div style={{ color: '#64748B', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>
                  Phone &amp; WhatsApp Support
                </div>
                <a href="tel:+233245660622" style={{ color: '#059669', textDecoration: 'none', fontWeight: 700 }}>
                  +233 24 566 0622
                </a>
              </div>


            </div>
          </section>

        </div>

        {/* Footer Note */}
        <div style={{
          marginTop: '3.5rem',
          textAlign: 'center',
          borderTop: '1px solid #E2E8F0',
          paddingTop: '2rem',
          color: '#64748B',
          fontSize: '0.85rem'
        }}>
          <div>&copy; 2026 Labour Group of Companies. All Rights Reserved.</div>
          <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#94A3B8' }}>
            Built for Ghanaian Basic Schools &bull; GES Curriculum &amp; Data Protection Act (Act 843) Compliant
          </div>
        </div>

      </main>
    </div>
  );
};

export default PrivacyPolicy;
