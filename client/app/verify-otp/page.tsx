'use client';

import './verify-otp.css';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import api from '@/lib/api';
import { setToken } from '@/lib/auth';

function VerifyOTPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!email) {
      router.push('/signup');
    }
  }, [email, router]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value[0];
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const otpString = otp.join('');

    try {
      const response = await api.post('/auth/verify-otp', { 
        email, 
        otp: otpString,
        type: 'signup'
      });
      
      setSuccess('Email verified successfully!');
      
      // If server returns token, save it and go to dashboard
      if (response.data.token) {
        setToken(response.data.token);
        setTimeout(() => router.push('/dashboard'), 1500);
      } else {
        // Otherwise redirect to login
        setTimeout(() => router.push('/login?verified=true'), 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    
    setError('');
    setSuccess('');
    setResending(true);

    try {
      await api.post('/auth/resend-otp', { 
        email,
        type: 'signup'
      });
      setSuccess('OTP sent successfully!');
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="verify-otp-container">
      {/* Left Panel - Information Side */}
      <div className="verify-otp-left-panel">
        <a href="/signup" className="back-button-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
          Back to Sign Up
        </a>
        <div className="left-content">
          <div className="brand-showcase">
            <div className="brand-icon-large">
              <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={80} height={80} />
            </div>
            <h1 className="brand-title">ThinkFlow</h1>
            <p className="brand-tagline">Almost There!</p>
          </div>
          
          <div className="features-list">
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="20" height="16" x="2" y="4" rx="2"/>
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                </svg>
              </div>
              <div className="feature-text">
                <h3>Check Your Inbox</h3>
                <p>We've sent a 6-digit verification code to your email</p>
              </div>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div className="feature-text">
                <h3>Code Expires Soon</h3>
                <p>Enter your code within 10 minutes for security</p>
              </div>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  <path d="m9 12 2 2 4-4"/>
                </svg>
              </div>
              <div className="feature-text">
                <h3>Secure Verification</h3>
                <p>Your account security is our priority</p>
              </div>
            </div>
            
            <div className="feature-item">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
                </svg>
              </div>
              <div className="feature-text">
                <h3>Start Your Journey</h3>
                <p>Once verified, dive into problem-solving mastery</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form Side */}
      <div className="verify-otp-right-panel">
        <div className="verify-otp-card">
          <div className="verify-otp-header">
            <div className="email-icon-wrapper">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#667eea" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
            </div>
            <h1 className="verify-otp-title">Verify Your Email</h1>
            <p className="verify-otp-subtitle">
              We've sent a 6-digit code to<br />
              <span className="email-highlight">{email}</span>
            </p>
          </div>

          {error && (
            <div className="error-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" x2="12" y1="8" y2="12"/>
                <line x1="12" x2="12.01" y1="16" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {success && (
            <div className="success-message">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="verify-otp-form">
            <div className="otp-inputs-wrapper">
              <label className="otp-label">Enter verification code</label>
              <div className="otp-inputs">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      inputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="otp-input"
                    disabled={loading || resending}
                  />
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading || otp.some(d => !d)} className="submit-button">
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Verifying...
                </>
              ) : (
                <>
                  Verify Email
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14"/>
                    <path d="m12 5 7 7-7 7"/>
                  </svg>
                </>
              )}
            </button>

            <div className="resend-section">
              <span className="resend-text">Didn't receive the code?</span>
              <button
                type="button"
                onClick={handleResend}
                disabled={countdown > 0 || resending}
                className="resend-button"
              >
                {resending ? (
                  <>
                    <span className="spinner-small"></span>
                    Sending...
                  </>
                ) : countdown > 0 ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Resend in {countdown}s
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                      <path d="M3 3v5h5"/>
                      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                      <path d="M16 21h5v-5"/>
                    </svg>
                    Resend Code
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={
      <div className="verify-otp-container">
        <div className="verify-otp-left-panel">
          <div className="left-content">
            <div className="brand-showcase">
              <div className="brand-icon-large">
                <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={80} height={80} />
              </div>
              <h1 className="brand-title">ThinkFlow</h1>
            </div>
          </div>
        </div>
        <div className="verify-otp-right-panel">
          <div className="verify-otp-card">
            <div className="loading-state">
              <span className="spinner"></span>
              Loading...
            </div>
          </div>
        </div>
      </div>
    }>
      <VerifyOTPContent />
    </Suspense>
  );
}
