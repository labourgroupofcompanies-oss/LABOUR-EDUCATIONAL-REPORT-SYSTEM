import React, { useState } from 'react';
import { OPENAPI_SPEC, generateCodeSnippet } from '../../services/openApiService';

const ApiDocsCenter = () => {
  const [selectedEndpoint, setSelectedEndpoint] = useState('/schools');
  const [selectedMethod, setSelectedMethod] = useState('get');
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [selectedSchema, setSelectedSchema] = useState('School');

  const paths = OPENAPI_SPEC.paths;
  const currentPathObj = paths[selectedEndpoint]?.[selectedMethod];
  const schemas = OPENAPI_SPEC.components.schemas;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Title Header */}
      <div>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, color: 'white', margin: 0 }}>
          API Documentation Center
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.88rem', margin: '0.25rem 0 0' }}>
          OpenAPI 3.0 Standard Specification, interactive code snippets, and domain JSON schemas.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem' }}>
        {/* Left Sidebar Menu */}
        <div style={{
          background: '#0f172a',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem'
        }}>
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
              Endpoints Index
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {Object.keys(paths).map(pathKey => (
                Object.keys(paths[pathKey]).map(methodKey => (
                  <button
                    key={`${pathKey}-${methodKey}`}
                    onClick={() => {
                      setSelectedEndpoint(pathKey);
                      setSelectedMethod(methodKey);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: (selectedEndpoint === pathKey && selectedMethod === methodKey) ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                      border: 'none',
                      color: (selectedEndpoint === pathKey && selectedMethod === methodKey) ? '#38bdf8' : '#94a3b8',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{
                      padding: '0.15rem 0.4rem',
                      borderRadius: '4px',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      background: methodKey === 'get' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                      color: methodKey === 'get' ? '#34d399' : '#60a5fa'
                    }}>
                      {methodKey}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{pathKey}</span>
                  </button>
                ))
              ))}
            </div>
          </div>

          <div style={{ paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
              JSON Schemas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {Object.keys(schemas).map(schemaName => (
                <button
                  key={schemaName}
                  onClick={() => setSelectedSchema(schemaName)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '0.45rem 0.75rem',
                    borderRadius: '6px',
                    background: selectedSchema === schemaName ? 'rgba(13, 148, 136, 0.15)' : 'transparent',
                    border: 'none',
                    color: selectedSchema === schemaName ? '#2dd4bf' : '#64748b',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <i className="fas fa-cube" style={{ fontSize: '0.7rem' }}></i>
                  <span>{schemaName} Schema</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Endpoint Details Card */}
          <div style={{
            background: '#0f172a',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '1.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
              <span style={{
                padding: '0.3rem 0.8rem',
                borderRadius: '6px',
                fontWeight: 800,
                fontSize: '0.85rem',
                textTransform: 'uppercase',
                background: selectedMethod === 'get' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                color: selectedMethod === 'get' ? '#34d399' : '#60a5fa'
              }}>
                {selectedMethod}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: 'white' }}>
                https://api.laboureducational.edu.gh/v1{selectedEndpoint}
              </span>
            </div>

            <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.2rem', margin: '0 0 0.5rem', color: '#f8fafc' }}>
              {currentPathObj?.summary || 'Endpoint Overview'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
              {currentPathObj?.description}
            </p>

            {/* Parameters Table */}
            {currentPathObj?.parameters && (
              <div style={{ marginBottom: '1.5rem' }}>
                <h4 style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: '0 0 0.75rem' }}>Request Parameters</h4>
                <div style={{ background: '#1e293b', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#64748b', background: 'rgba(255,255,255,0.02)' }}>
                        <th style={{ padding: '0.75rem 1rem' }}>Parameter</th>
                        <th style={{ padding: '0.75rem 1rem' }}>In</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                        <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentPathObj.parameters.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                          <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: '#38bdf8', fontWeight: 700 }}>{p.name}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#94a3b8' }}>{p.in}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#a78bfa' }}>{p.schema?.type}</td>
                          <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>{p.description || 'Query parameter'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Response Status Codes */}
            <div>
              <h4 style={{ color: '#cbd5e1', fontSize: '0.95rem', margin: '0 0 0.75rem' }}>HTTP Responses</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {Object.keys(currentPathObj?.responses || {}).map(code => (
                  <div key={code} style={{
                    padding: '0.5rem 0.85rem',
                    borderRadius: '8px',
                    background: code.startsWith('2') ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                    border: `1px solid ${code.startsWith('2') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    fontSize: '0.8rem',
                    color: code.startsWith('2') ? '#34d399' : '#fca5a5'
                  }}>
                    <strong>{code}</strong>: {currentPathObj.responses[code].description}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Synchronized Multi-Language Code Snippet Generator */}
          <div style={{
            background: '#0f172a',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', color: 'white' }}>
                Code Generator Examples
              </h3>

              {/* Language Switcher */}
              <div style={{ display: 'flex', gap: '6px', background: '#1e293b', padding: '3px', borderRadius: '8px' }}>
                {['javascript', 'node', 'python', 'php', 'curl'].map(lang => (
                  <button
                    key={lang}
                    onClick={() => setSelectedLanguage(lang)}
                    style={{
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      background: selectedLanguage === lang ? '#2563eb' : 'transparent',
                      color: selectedLanguage === lang ? 'white' : '#94a3b8',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textTransform: 'uppercase'
                    }}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <pre style={{
              background: '#090d16',
              padding: '1.25rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#38bdf8',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              lineHeight: 1.5,
              overflowX: 'auto',
              margin: 0
            }}>
              {generateCodeSnippet(selectedMethod, selectedEndpoint, selectedLanguage)}
            </pre>
          </div>

          {/* Selected JSON Schema Viewer */}
          {selectedSchema && schemas[selectedSchema] && (
            <div style={{
              background: '#0f172a',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '1.5rem'
            }}>
              <h3 style={{ margin: '0 0 1rem', fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', color: 'white' }}>
                JSON Schema: <span style={{ color: '#2dd4bf' }}>{selectedSchema}</span>
              </h3>
              <pre style={{
                background: '#090d16',
                padding: '1.25rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#a78bfa',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                lineHeight: 1.5,
                overflowX: 'auto',
                margin: 0
              }}>
                {JSON.stringify(schemas[selectedSchema], null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ApiDocsCenter;
