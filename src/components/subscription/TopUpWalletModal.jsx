import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import paystackService from '../../services/paystackService';
import subscriptionService from '../../services/subscriptionService';
import { supabase } from '../../lib/supabase';
import { db } from '../../lib/db';
import LogoPreloader from '../common/LogoPreloader';

const TopUpWalletModal = ({ schoolId, currentBalance = 0, requiredAmount = 0, onClose, onSuccess }) => {
  // Calculate recommended default shortfall if balance is below required amount
  const shortfall = requiredAmount > currentBalance ? Math.ceil(requiredAmount - currentBalance) : 100;
  
  const [topUpAmount, setTopUpAmount] = useState(shortfall > 0 ? String(shortfall) : '100');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [successData, setSuccessData] = useState({ amount: 0, newBalance: 0, reference: '' });
  
  // Tab control inside modal ('topup' | 'history')
  const [modalTab, setModalTab] = useState('topup');
  const [modalHistory, setModalHistory] = useState([]);
  const [loadingModalHistory, setLoadingModalHistory] = useState(false);

  // Lock background body scroll while modal pop-up is active
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Listen for Escape key to close pop-up
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const fetchModalHistory = async () => {
    if (!schoolId) return;
    setLoadingModalHistory(true);
    try {
      const history = await subscriptionService.getSchoolTopUpHistory(schoolId);
      setModalHistory(history || []);
    } catch (err) {
      console.error('[TopUpWalletModal] History load error:', err);
    } finally {
      setLoadingModalHistory(false);
    }
  };

  React.useEffect(() => {
    if (modalTab === 'history') {
      fetchModalHistory();
    }
  }, [modalTab, schoolId]);

  const numAmount = Number(topUpAmount) || 0;
  const estimatedNewBalance = (Number(currentBalance) || 0) + numAmount;

  const presetAmounts = [50, 100, 200, 500, 1000, 2000];

  const handleStartPaystack = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!numAmount || numAmount < 5) {
      setErrorMsg('Minimum wallet top-up amount is GH₵ 5.00');
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const customerEmail = session?.user?.email || `school_${String(schoolId).substring(0, 6)}@labouredu.app`;
      const reference = `LBRED-${String(schoolId).substring(0, 6)}-${Date.now().toString().slice(-6)}`;
      const amountInKobo = Math.round(numAmount * 100);

      paystackService.openPaystackPopup({
        reference,
        email: customerEmail,
        amountInKobo,
        currency: 'GHS',
        onSuccess: async (response) => {
          try {
            const txRef = response.reference || reference;

            // 1. Record payment transaction in Supabase
            await supabase
              .from('payment_transactions')
              .insert({
                school_id: schoolId,
                provider: 'paystack',
                provider_reference: txRef,
                payment_method: 'paystack',
                currency: 'GHS',
                requested_amount: numAmount,
                verified_amount: numAmount,
                status: 'COMPLETED',
                customer_email: customerEmail,
                completed_at: new Date().toISOString(),
                initiated_by: session?.user?.id
              });

            // 2. Credit school wallet balance via subscriptionService
            await subscriptionService.topUpSchoolWallet(
              schoolId,
              numAmount,
              txRef,
              'Paystack Online Wallet Top Up',
              'School Admin'
            );

            // 3. Update local IndexedDB cache for instant UI reactivity
            try {
              const localSchool = await db.schools.get(schoolId);
              if (localSchool) {
                await db.schools.update(schoolId, {
                  wallet_balance: estimatedNewBalance,
                  walletBalance: estimatedNewBalance
                });
              }
            } catch (_) {}

            setSuccessData({
              amount: numAmount,
              newBalance: estimatedNewBalance,
              reference: txRef
            });
            setIsSuccess(true);
            if (onSuccess) onSuccess();
          } catch (err) {
            console.error('Wallet Credit Error:', err);
            // Fallback direct update on report_schools
            let fallbackSucceeded = false;
            try {
              const { data: schoolData } = await supabase
                .from('report_schools')
                .select('wallet_balance')
                .eq('id', schoolId)
                .single();

              const oldBal = Number(schoolData?.wallet_balance || currentBalance || 0);
              const newBal = oldBal + numAmount;

              const { error: updateErr } = await supabase
                .from('report_schools')
                .update({ wallet_balance: newBal })
                .eq('id', schoolId);

              if (!updateErr) {
                fallbackSucceeded = true;

                // Update local Dexie
                const localSchool = await db.schools.get(schoolId);
                if (localSchool) {
                  await db.schools.update(schoolId, {
                    wallet_balance: newBal,
                    walletBalance: newBal
                  });
                }

                setSuccessData({
                  amount: numAmount,
                  newBalance: newBal,
                  reference: txRef
                });
              }
            } catch (fallbackErr) {
              console.error('Fallback wallet credit failed:', fallbackErr);
            }

            if (fallbackSucceeded) {
              setIsSuccess(true);
              if (onSuccess) onSuccess();
            } else {
              setErrorMsg('Your payment was received, but there was an issue updating your wallet. Please contact support with reference: ' + txRef);
            }
          } finally {
            setLoading(false);
          }
        },
        onCancel: () => {
          setLoading(false);
        }
      });
    } catch (err) {
      console.error('Paystack Launch Error:', err);
      setErrorMsg('Could not start Paystack checkout: ' + err.message);
      setLoading(false);
    }
  };

  return createPortal(
    <div 
      className="topup-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(9, 9, 11, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0.75rem',
        animation: 'backdropFadeIn 0.2s ease-out'
      }}
    >
      <style>{`
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalPopIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: '20px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.1)',
          border: '1px solid #E4E4E7',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalPopIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        
        {/* Modal Header */}
        <div style={{
          background: '#09090b',
          padding: '1rem 1.25rem',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid #27272a'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(37, 99, 235, 0.18)',
              border: '1px solid rgba(37, 99, 235, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#3b82f6',
              fontSize: '1.1rem'
            }}>
              <i className="fas fa-wallet" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 800 }}>
                Top Up School Wallet
              </h3>
              <p style={{ margin: '1px 0 0', color: '#94a3b8', fontSize: '0.74rem' }}>
                Instant Mobile Money &amp; Card deposit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.15rem',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Modal Tab Switcher */}
        {!isSuccess && (
          <div style={{ display: 'flex', borderBottom: '1px solid #E4E4E7', background: '#F8FAFC' }}>
            <button
              type="button"
              onClick={() => setModalTab('topup')}
              style={{
                flex: 1,
                padding: '0.55rem',
                border: 'none',
                background: modalTab === 'topup' ? '#FFFFFF' : 'transparent',
                borderBottom: modalTab === 'topup' ? '2.5px solid #2563eb' : 'none',
                color: modalTab === 'topup' ? '#2563eb' : '#64748b',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <i className="fas fa-bolt" /> Top Up Wallet
            </button>

            <button
              type="button"
              onClick={() => setModalTab('history')}
              style={{
                flex: 1,
                padding: '0.55rem',
                border: 'none',
                background: modalTab === 'history' ? '#FFFFFF' : 'transparent',
                borderBottom: modalTab === 'history' ? '2.5px solid #2563eb' : 'none',
                color: modalTab === 'history' ? '#2563eb' : '#64748b',
                fontWeight: 800,
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
              }}
            >
              <i className="fas fa-receipt" /> Deposit History
            </button>
          </div>
        )}

        {/* Modal Body */}
        {isSuccess ? (
          <div style={{ padding: '1.5rem 1.25rem', textAlign: 'center' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              background: '#ECFDF5',
              border: '2px solid #A7F3D0',
              color: '#10B981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.85rem',
              margin: '0 auto 0.85rem',
              boxShadow: '0 6px 18px rgba(16, 185, 129, 0.2)'
            }}>
              <i className="fas fa-check-circle" />
            </div>

            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 900, color: '#09090b', margin: '0 0 0.25rem' }}>
              Wallet Credited Successfully!
            </h3>
            
            <p style={{ color: '#64748b', fontSize: '0.82rem', margin: '0 0 1rem', lineHeight: 1.4 }}>
              Your school balance has been credited and is active immediately.
            </p>

            {/* Receipt Breakdown Box */}
            <div style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              marginBottom: '1.15rem',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>Amount Credited</span>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 900, color: '#10B981' }}>
                  GH₵ {Number(successData.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 700 }}>New Balance</span>
                <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 900, color: '#09090b' }}>
                  GH₵ {Number(successData.newBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '0.45rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700 }}>Reference</span>
                <code style={{ fontSize: '0.72rem', color: '#09090b', background: '#E2E8F0', padding: '0.1rem 0.35rem', borderRadius: '4px', fontWeight: 700 }}>
                  {successData.reference}
                </code>
              </div>
            </div>

            {/* Exit Button */}
            <button
              type="button"
              onClick={() => {
                if (onSuccess) onSuccess();
                onClose();
              }}
              style={{
                width: '100%',
                padding: '0.75rem 1.25rem',
                borderRadius: '10px',
                background: '#2563eb',
                border: 'none',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <i className="fas fa-check" /> Done &amp; Close
            </button>
          </div>
        ) : modalTab === 'history' ? (
          <div style={{ padding: '1.15rem', maxHeight: '340px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '0.92rem', fontWeight: 800, color: '#09090b' }}>
                Wallet Deposit History
              </h4>
              <button
                type="button"
                onClick={fetchModalHistory}
                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <i className={`fas fa-sync-alt ${loadingModalHistory ? 'fa-spin' : ''}`} /> Refresh
              </button>
            </div>

            {loadingModalHistory ? (
              <div style={{ padding: '1rem 0' }}>
                <LogoPreloader fullScreen={false} size="sm" />
              </div>
            ) : modalHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {modalHistory.map((item) => (
                  <div key={item.id || item.reference} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.65rem 0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ color: '#09090b', fontSize: '0.88rem', display: 'block' }}>
                        + GH₵ {Number(item.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </strong>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                        {item.method} • {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ padding: '0.1rem 0.45rem', borderRadius: '4px', background: '#ECFDF5', color: '#10B981', fontSize: '0.68rem', fontWeight: 800, display: 'inline-block', border: '1px solid #A7F3D0' }}>
                        ✓ COMPLETED
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '1.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                No deposit transactions recorded yet.
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                width: '100%',
                marginTop: '0.85rem',
                padding: '0.65rem',
                borderRadius: '10px',
                background: '#F1F5F9',
                border: '1px solid #CBD5E1',
                color: '#18181b',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleStartPaystack} style={{ padding: '1.15rem 1.25rem' }}>
            
            {/* Current Balance Summary Box */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '0.65rem 0.95rem',
              marginBottom: '0.9rem'
            }}>
              <div>
                <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Current Balance
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', fontWeight: 900, color: '#09090b' }}>
                  GH₵ {Number(currentBalance).toLocaleString()}
                </div>
              </div>

              {requiredAmount > 0 && requiredAmount > currentBalance && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', color: '#EF4444', fontWeight: 800, textTransform: 'uppercase' }}>
                    Required Shortfall
                  </div>
                  <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 900, color: '#EF4444' }}>
                    GH₵ {Number(requiredAmount - currentBalance).toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Amount Input */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#18181b', marginBottom: '0.35rem' }}>
                Enter Top Up Amount (GH₵)
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontWeight: 900,
                  color: '#2563eb',
                  fontSize: '1rem'
                }}>
                  GH₵
                </span>
                <input
                  type="number"
                  min="5"
                  step="any"
                  required
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="e.g. 100"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem 0.65rem 3.25rem',
                    borderRadius: '10px',
                    border: '2px solid #2563eb',
                    fontSize: '1.1rem',
                    fontWeight: 900,
                    color: '#09090b',
                    outline: 'none',
                    boxShadow: '0 1px 4px rgba(37, 99, 235, 0.12)'
                  }}
                />
              </div>
            </div>

            {/* Preset Quick Select Chips */}
            <div style={{ marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {presetAmounts.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTopUpAmount(String(amt))}
                    style={{
                      flex: '1 1 28%',
                      padding: '0.35rem 0.4rem',
                      borderRadius: '8px',
                      border: String(numAmount) === String(amt) ? '1.5px solid #2563eb' : '1px solid #E2E8F0',
                      background: String(numAmount) === String(amt) ? '#EFF6FF' : '#FFFFFF',
                      color: String(numAmount) === String(amt) ? '#2563eb' : '#334155',
                      fontWeight: 800,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      textAlign: 'center',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    +GH₵{amt.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>

            {/* New Balance Est. Preview */}
            <div style={{
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: '10px',
              padding: '0.5rem 0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#065F46', fontWeight: 800 }}>New Balance After Deposit</span>
              <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.95rem', fontWeight: 900, color: '#10B981' }}>
                GH₵ {estimatedNewBalance.toLocaleString()}
              </span>
            </div>

            {errorMsg && (
              <div style={{
                marginBottom: '0.75rem',
                padding: '0.55rem 0.75rem',
                borderRadius: '8px',
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#EF4444',
                fontSize: '0.76rem',
                fontWeight: 700
              }}>
                {errorMsg}
              </div>
            )}

            {/* Footer Actions */}
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: '1',
                  padding: '0.7rem',
                  borderRadius: '10px',
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  color: '#64748b',
                  fontWeight: 800,
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              
              <button
                type="submit"
                disabled={loading || numAmount < 5}
                style={{
                  flex: '2',
                  padding: '0.7rem 1rem',
                  borderRadius: '10px',
                  background: loading ? '#94A3B8' : '#09090b',
                  border: 'none',
                  color: '#FFFFFF',
                  fontWeight: 900,
                  fontSize: '0.88rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: loading ? 'none' : '0 4px 12px rgba(9, 9, 11, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin" /> Launching...
                  </>
                ) : (
                  <>
                    <i className="fas fa-lock" /> Pay GH₵ {numAmount.toLocaleString()}
                  </>
                )}
              </button>
            </div>

          </form>
        )}
      </div>
    </div>,
    document.body
  );
};

export default TopUpWalletModal;
