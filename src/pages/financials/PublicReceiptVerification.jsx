import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import LogoPreloader from '../../components/common/LogoPreloader';

const PublicReceiptVerification = () => {
  const { receiptNumber } = useParams();
  const [loading, setLoading] = useState(true);
  const [txData, setTxData] = useState(null);
  const [schoolData, setSchoolData] = useState(null);
  const [learnerData, setLearnerData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVerification = async () => {
      if (!receiptNumber) return;
      setLoading(true);
      setError(null);

      try {
        // Query Supabase for receipt
        const { data: cloudTx, error: txErr } = await supabase
          .from('learner_fee_transactions')
          .select('*, learner:report_learners(*), school:report_schools(*)')
          .eq('receipt_number', receiptNumber.trim())
          .maybeSingle();

        if (cloudTx && !txErr) {
          setTxData(cloudTx);
          setSchoolData(cloudTx.school);
          setLearnerData(cloudTx.learner);
        } else {
          // Local Dexie search fallback
          const localTx = await db.feeTransactions.where('receiptNumber').equals(receiptNumber.trim()).first();
          if (localTx) {
            setTxData(localTx);
            const school = await db.schools.get(localTx.schoolId);
            const learner = await db.learners.get(localTx.learnerId);
            setSchoolData(school);
            setLearnerData(learner);
          } else {
            setError('Receipt number not found in official registry.');
          }
        }
      } catch (err) {
        console.error('Verification error:', err);
        setError('Failed to verify receipt: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchVerification();
  }, [receiptNumber]);

  return (
    <div style={{
      minHeight: '100vh', background: '#09090b',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', fontFamily: 'sans-serif'
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '20px', maxWidth: '460px', width: '100%',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)', overflow: 'hidden', border: '1px solid #27272a'
      }}>
        {/* Top Header */}
        <div style={{ background: '#09090b', padding: '1.5rem', textAlign: 'center', color: '#fff', borderBottom: '1px solid #27272a' }}>
          <i className="fas fa-shield-halved" style={{ fontSize: '2.5rem', color: '#2563eb', marginBottom: '0.5rem' }} />
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Official Receipt Verification
          </h2>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '4px' }}>
            Labour Edu Educational Report Platform
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.75rem' }}>
          {loading ? (
            <div style={{ padding: '1rem 0' }}>
              <LogoPreloader fullScreen={false} size="sm" />
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', color: '#EF4444' }}>
              <i className="fas fa-circle-xmark" style={{ fontSize: '2.5rem', color: '#EF4444', marginBottom: '0.75rem' }} />
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Receipt Not Found</h3>
              <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5 }}>{error}</p>
            </div>
          ) : txData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Authenticity Badge */}
              <div style={{
                textAlign: 'center', padding: '0.85rem',
                background: txData.receipt_status === 'REVERSED' ? '#FEF2F2' : '#ECFDF5',
                border: `1.5px solid ${txData.receipt_status === 'REVERSED' ? '#FECACA' : '#A7F3D0'}`,
                borderRadius: '12px',
                color: txData.receipt_status === 'REVERSED' ? '#EF4444' : '#10B981'
              }}>
                <i className={`fas ${txData.receipt_status === 'REVERSED' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`} style={{ fontSize: '1.5rem', marginBottom: '4px' }} />
                <div style={{ fontWeight: 900, fontSize: '1rem', textTransform: 'uppercase' }}>
                  {txData.receipt_status === 'REVERSED' ? 'TRANSACTION REVERSED' : 'VERIFIED AUTHENTIC RECEIPT'}
                </div>
                <div style={{ fontSize: '0.72rem', opacity: 0.9, marginTop: '2px' }}>
                  Registered in official school financial ledger
                </div>
              </div>

              {/* Receipt Specs */}
              <div style={{ background: '#FAFAFA', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #E4E4E7', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', paddingBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>Receipt Number:</span>
                  <strong style={{ color: '#2563eb' }}>{txData.receipt_number || txData.receiptNumber}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', paddingBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>School:</span>
                  <strong style={{ color: '#09090b' }}>{schoolData?.name || 'School'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', paddingBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>Learner:</span>
                  <strong style={{ color: '#09090b' }}>{learnerData?.full_name || learnerData?.fullName || 'Learner'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', paddingBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>Amount Paid:</span>
                  <strong style={{ color: '#10B981', fontSize: '1rem' }}>GH₵ {Number(txData.amount || 0).toFixed(2)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E4E4E7', paddingBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>Payment Mode:</span>
                  <strong style={{ color: '#18181b' }}>{txData.payment_method || txData.paymentMethod || 'CASH'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#71717a' }}>Date &amp; Time:</span>
                  <span style={{ color: '#18181b' }}>{new Date(txData.created_at || txData.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <Link to="/" style={{ color: '#2563eb', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none' }}>
              &larr; Back to Portal
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicReceiptVerification;
