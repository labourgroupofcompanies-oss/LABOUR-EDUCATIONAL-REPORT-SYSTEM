import React, { useRef } from 'react';
import learnerPaymentService from '../../services/learnerPaymentService';

const LearnerReceiptModal = ({ isOpen, onClose, transaction, schoolInfo, learnerInfo, staffName }) => {
  const printRef = useRef();

  if (!isOpen || !transaction) return null;

  const receiptNo = transaction.receipt_number || transaction.receiptNumber || 'RCP-2026-000001';
  const amount = Number(transaction.amount || 0);
  const balBefore = Number(transaction.balance_before ?? transaction.balanceBefore ?? 0);
  const balAfter = Number(transaction.balance_after ?? transaction.balanceAfter ?? 0);
  const dateStr = new Date(transaction.created_at || transaction.createdAt || Date.now()).toLocaleString();
  const paymentMethod = transaction.payment_method || transaction.paymentMethod || 'CASH';
  const status = transaction.receipt_status || transaction.receiptStatus || 'ACTIVE';
  const learnerName = learnerInfo?.fullName || transaction.learner?.full_name || 'Learner';
  const regNo = learnerInfo?.regNumber || transaction.learner?.reg_number || '—';

  // Public verification URL for QR Code
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(
    `${window.location.origin}/verify-receipt/${receiptNo}`
  )}`;

  const handlePrint = async () => {
    // Log reprint audit
    if (schoolInfo?.id) {
      await learnerPaymentService.logReceiptReprint(schoolInfo.id, receiptNo, staffName || 'Staff', 'Print/Reprint Action');
    }

    const printContents = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
      <html>
        <head>
          <title>Receipt ${receiptNo}</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 12px; padding: 10px; margin: 0; color: #000; }
            .receipt-box { width: 100%; max-width: 320px; margin: 0 auto; text-align: center; }
            .logo { max-height: 50px; margin-bottom: 5px; }
            .divider { border-top: 1px dashed #000; margin: 8px 0; }
            .row { display: flex; justify-content: space-between; margin: 4px 0; text-align: left; }
            .bold { font-weight: bold; }
            .status-badge { display: inline-block; padding: 2px 6px; border: 1px solid #000; font-size: 10px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          ${printContents}
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(9, 9, 11, 0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '1rem'
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', maxWidth: '420px', width: '100%',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4)', overflow: 'hidden', display: 'flex', flexDirection: 'column', border: '1px solid #E4E4E7'
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '1rem 1.25rem', background: '#09090b', color: '#fff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #27272a'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem', fontWeight: 800 }}>
            <i className="fas fa-receipt" style={{ color: '#2563eb' }} />
            Official Payment Receipt
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer', fontSize: '1.1rem' }}>
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Printable Voucher Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', maxHeight: '70vh' }}>
          <div ref={printRef} className="receipt-box" style={{ fontFamily: 'Courier New, monospace', fontSize: '0.82rem', color: '#18181b', background: '#FAFAFA', padding: '1rem', border: '1px solid #E4E4E7', borderRadius: '12px' }}>
            
            {/* School Info */}
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              {schoolInfo?.logoUrl && (
                <img src={schoolInfo.logoUrl} alt="Logo" style={{ maxHeight: '45px', margin: '0 auto 4px', display: 'block' }} />
              )}
              <div style={{ fontWeight: 900, fontSize: '0.95rem', textTransform: 'uppercase', color: '#09090b' }}>
                {schoolInfo?.name || 'Labour Edu Academy'}
              </div>
              {schoolInfo?.motto && <div style={{ fontSize: '0.7rem', fontStyle: 'italic', color: '#71717a' }}>"{schoolInfo.motto}"</div>}
              <div style={{ fontSize: '0.68rem', color: '#71717a' }}>
                {[schoolInfo?.location, schoolInfo?.district, schoolInfo?.region].filter(Boolean).join(' • ')}
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #E4E4E7', margin: '8px 0' }} />

            {/* Receipt Serial & Status */}
            <div style={{ textAlign: 'center', margin: '6px 0' }}>
              <div style={{ fontSize: '0.72rem', color: '#71717a', fontWeight: 600 }}>RECEIPT NO</div>
              <div style={{ fontSize: '1rem', fontWeight: 900, color: '#2563eb', letterSpacing: '0.04em' }}>{receiptNo}</div>
              {status !== 'ACTIVE' && (
                <div style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#EF4444', fontWeight: 900, borderRadius: '4px', fontSize: '0.7rem' }}>
                  STATUS: {status}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px dashed #E4E4E7', margin: '8px 0' }} />

            {/* Details Table */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Date:</span>
                <span style={{ fontWeight: 700 }}>{dateStr}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Learner:</span>
                <span style={{ fontWeight: 700 }}>{learnerName}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Reg No:</span>
                <span style={{ fontWeight: 700 }}>{regNo}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Academic Year:</span>
                <span>{transaction.academic_year || transaction.academicYear || '2025/2026'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Term:</span>
                <span>{transaction.term || 'Term 1'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Payment Mode:</span>
                <span style={{ fontWeight: 700 }}>{paymentMethod}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Received By:</span>
                <span>{transaction.received_by_staff || staffName || 'Bursar'}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #E4E4E7', margin: '8px 0' }} />

            {/* Financial Totals */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: '#fff', padding: '8px', borderRadius: '8px', border: '1px solid #E4E4E7' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                <span style={{ color: '#71717a' }}>Balance Before:</span>
                <span>GH₵ {balBefore.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.95rem', fontWeight: 900, color: '#10B981' }}>
                <span>Amount Paid:</span>
                <span>GH₵ {amount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 800, color: balAfter > 0 ? '#EF4444' : '#10B981' }}>
                <span>Remaining Balance:</span>
                <span>GH₵ {balAfter.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed #E4E4E7', margin: '10px 0 8px' }} />

            {/* QR Code & Verification */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left', marginTop: '6px' }}>
              <img src={qrCodeUrl} alt="Receipt Verification QR" style={{ width: '64px', height: '64px', border: '1px solid #E4E4E7', borderRadius: '4px', padding: '2px', background: '#fff' }} />
              <div style={{ fontSize: '0.62rem', color: '#71717a', lineHeight: 1.3 }}>
                <strong style={{ color: '#09090b' }}>Authentic Digital Voucher</strong><br />
                Scan QR Code to verify official receipt status online.
              </div>
            </div>

            <div style={{ fontSize: '0.6rem', color: '#A1A1AA', textAlign: 'center', marginTop: '8px' }}>
              Thank you for supporting Labour Edu Academy!
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div style={{ padding: '1rem', background: '#FAFAFA', borderTop: '1px solid #E4E4E7', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: '#FFFFFF', border: '1px solid #E4E4E7', color: '#71717a', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem' }}>
            Close
          </button>
          <button onClick={handlePrint} style={{ padding: '0.5rem 1.25rem', background: '#09090b', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fas fa-print" />
            Print / Thermal Receipt
          </button>
        </div>
      </div>
    </div>
  );
};

export default LearnerReceiptModal;
