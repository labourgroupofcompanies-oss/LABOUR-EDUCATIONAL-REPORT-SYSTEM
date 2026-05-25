import React from 'react';

const ClassManager = ({
  classes,
  className,
  setClassName,
  teachingMode,
  setTeachingMode,
  addClass,
  deleteClass,
  updateClassMode
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
            <i className="fas fa-school" style={{ fontSize: '1.1rem' }}></i>
          </span>
          Classes Manager
        </h2>
        <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Register and configure your institution's grade groups and academic streams.
        </p>
      </div>

      <form onSubmit={addClass} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              className="form-input" 
              style={{ flex: '2 1 200px', fontSize: '0.875rem' }}
              placeholder="e.g. Basic 1" 
              value={className}
              required
              onChange={(e) => setClassName(e.target.value)}
            />
            <select
              className="form-input"
              style={{ flex: '1 1 180px', background: 'var(--surface)', cursor: 'pointer', fontSize: '0.875rem' }}
              value={teachingMode}
              onChange={(e) => setTeachingMode(e.target.value)}
            >
              <option value="class_teacher">Class Teacher Mode</option>
              <option value="subject_teacher">Subject Teacher Mode</option>
            </select>
          </div>
          
          <button type="submit" className="btn btn-accent" style={{ alignSelf: 'flex-start', padding: '0.625rem 1.5rem' }}>
            <i className="fas fa-plus"></i> Add New Class
          </button>
        </div>

        <div style={{ 
          fontSize: '0.75rem', 
          padding: '0.75rem', 
          background: 'rgba(13, 148, 136, 0.05)', 
          borderRadius: '8px', 
          border: '1px solid rgba(13, 148, 136, 0.1)',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-start',
          color: 'var(--text-muted)'
        }}>
          <i className="fas fa-info-circle" style={{ color: 'var(--accent)', marginTop: '2px' }}></i>
          <div>
            <strong>Tip:</strong> Toggle a class's teaching mode instantly below. 
            <em> Class Teacher</em> locks score sheets to the classroom head, while 
            <em> Subject Teacher</em> unlocks individual specialization maps.
          </div>
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
        {classes?.length > 0 ? classes.map(c => {
          const mode = c.teachingMode || 'class_teacher';
          const isClassTeacher = mode === 'class_teacher';
          return (
            <div 
              key={c.id} 
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 auto' }}>
                <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.9rem' }}>{c.name}</span>
                <select
                  style={{ 
                    alignSelf: 'flex-start', 
                    fontSize: '0.7rem', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '6px',
                    fontWeight: 700,
                    background: isClassTeacher ? 'rgba(245, 158, 11, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                    color: isClassTeacher ? '#d97706' : '#2563eb',
                    border: isClassTeacher ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid rgba(59, 130, 246, 0.15)',
                    cursor: 'pointer',
                    width: 'auto',
                    height: 'auto',
                    minHeight: 'unset',
                    outline: 'none',
                    letterSpacing: '0.3px',
                    transition: 'var(--transition)'
                  }}
                  value={mode}
                  onChange={(e) => updateClassMode(c.id, e.target.value)}
                >
                  <option value="class_teacher" style={{ background: 'var(--surface)', color: '#d97706' }}>Class Teacher Mode</option>
                  <option value="subject_teacher" style={{ background: 'var(--surface)', color: '#2563eb' }}>Subject Teacher Mode</option>
                </select>
              </div>
              <button 
                className="btn btn-danger" 
                style={{ padding: '0.45rem 0.65rem', borderRadius: '6px', flex: '0 0 auto' }} 
                onClick={() => deleteClass(c.id)}
              >
                <i className="fas fa-trash-can" style={{ fontSize: '0.85rem' }}></i>
              </button>
            </div>
          );
        }) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <i className="fas fa-folder-open" style={{ fontSize: '2rem', display: 'block', marginBottom: '8px', opacity: 0.4 }}></i>
            <span style={{ fontSize: '0.85rem' }}>No classes registered yet.</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClassManager;
