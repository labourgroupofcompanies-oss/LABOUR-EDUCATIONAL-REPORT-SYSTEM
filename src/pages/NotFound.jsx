import React from 'react';
import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div className="fade-in">
        <h1 style={{ fontSize: '6rem', color: 'var(--accent)', marginBottom: '1rem' }}>404</h1>
        <h2 style={{ marginBottom: '1.5rem' }}>Page Not Found</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Sorry, the page you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">
          <i className="fas fa-home"></i>
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
