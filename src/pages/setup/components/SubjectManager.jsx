import React from 'react';

const SubjectManager = ({
  subjects,
  subjectName,
  setSubjectName,
  addSubject,
  deleteSubject
}) => {
  return (
    <div className="card hover-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
          <span style={{ 
            background: 'var(--accent-light)', 
            color: 'var(--accent)', 
            width: '36px', 
            height: '36px', 
            borderRadius: '8px', 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}>
            <i className="fas fa-book" style={{ fontSize: '1.1rem' }}></i>
          </span>
          Subjects Catalog
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Manage the standard academic subjects offered across your school.
        </p>
      </div>

      <form onSubmit={addSubject} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="form-input" 
            style={{ flex: '1 1 200px', fontSize: '0.875rem' }}
            placeholder="e.g. Mathematics" 
            value={subjectName}
            required
            onChange={(e) => setSubjectName(e.target.value)}
          />
          <button type="submit" className="btn btn-accent" style={{ flex: '0 0 auto', padding: '0.625rem 1.5rem' }}>
             <i className="fas fa-plus"></i> Add Subject
          </button>
        </div>
      </form>

      <div style={{ 
        maxHeight: '380px', 
        overflowY: 'auto', 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '8px',
        paddingRight: '4px'
      }}>
        {subjects?.length > 0 ? subjects.map(s => (
          <div 
            key={s.id} 
            className="class-row"
            style={{ 
              padding: '0.85rem 1rem', 
              background: 'var(--background)',
              borderRadius: '10px',
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ 
                color: 'var(--accent)', 
                background: 'rgba(13, 148, 136, 0.05)',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <i className="fas fa-book-bookmark" style={{ fontSize: '0.8rem' }}></i>
              </span>
              <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{s.name}</span>
            </div>
            
            <button 
              className="btn btn-danger" 
              style={{ padding: '0.45rem 0.65rem', borderRadius: '6px' }} 
              onClick={() => deleteSubject(s.id)}
            >
              <i className="fas fa-trash-can" style={{ fontSize: '0.85rem' }}></i>
            </button>
          </div>
        )) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-book-open" style={{ fontSize: '2rem', display: 'block', marginBottom: '8px', opacity: 0.4 }}></i>
            <span style={{ fontSize: '0.85rem' }}>No subjects added yet.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubjectManager;
