'use client';

import './verify-otp.css';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';

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
      await api.post('/auth/verify-otp', { 
        email, 
        otp: otpString,
        type: 'signup'
      });
      setSuccess('Email verified successfully!');
      setTimeout(() => router.push('/login?verified=true'), 1500);
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
      <div className="verify-otp-card">
        <div className="verify-otp-header">
          <a href="/signup" className="brand-link" style={{ display: 'inline-flex', marginBottom: '1rem' }}>
            ← Back
          </a>
          <a href="/" className="brand-link">
            <div className="brand-icon"></div>
            <span className="brand-text">ThinkFlow</span>
          </a>
          <h1 className="verify-otp-title">Verify Your Email</h1>
          <p className="verify-otp-subtitle">
            We've sent a 6-digit code to <span className="email-highlight">{email}</span>
          </p>
        </div>

        {error && (
          <div className="error-message">{error}</div>
        )}

        {success && (
          <div className="success-message">{success}</div>
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
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>

          <div className="resend-section">
            Didn't receive the code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              className="resend-button"
            >
              {resending ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend Code'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VerifyOTPPage() {
  return (
    <Suspense fallback={<div className="verify-otp-container"><div className="verify-otp-card">Loading...</div></div>}>
      <VerifyOTPContent />
    </Suspense>
  );
}
