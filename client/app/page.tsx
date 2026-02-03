'use client';

import './landingpage.css';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="landing-page">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-container">
          <a href="/" className="nav-brand">
            <div className="brand-icon">
              <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={40} height={40} />
            </div>
            <span className="brand-text">ThinkFlow</span>
          </a>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#why">Why ThinkFlow</a>
          </div>
          <div className="nav-actions">
            <a href="/login" className="nav-link">Login</a>
            <a href="/signup" className="nav-button">Get Started</a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <div className="hero-badge">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display: 'inline-block', verticalAlign: 'middle', marginRight: '8px'}}>
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
            </svg>
            Your Journey to Logic Mastery Starts Here
          </div>
          <h1 className="hero-title">Master Logic Programming Through Practice</h1>
          <p className="hero-description">
            ThinkFlow transforms the way you learn logical thinking. Write code, get instant feedback, 
            and watch your problem-solving skills soar with our interactive platform.
          </p>
          <div className="hero-actions">
            <a href="/signup" className="button-primary">Start Learning for Free</a>
            <a href="/login" className="button-secondary">Explore New Problems</a>
          </div>
          <p className="hero-note">No credit card required. Start solving problems in minutes.</p>
          
          {/* Example Problem Preview */}
          <div className="hero-example">
            <div className="example-window">
              <div className="window-controls">
                <div className="control-dot control-red"></div>
                <div className="control-dot control-yellow"></div>
                <div className="control-dot control-green"></div>
              </div>
              <div className="example-content">
                <div className="example-step">
                  <span className="step-label">Step 1:</span> Read problem description
                </div>
                <div className="example-step">
                  <span className="step-label">Step 2:</span> Write your logic solution
                </div>
                <div className="example-step">
                  <span className="step-label">Step 3:</span> Submit & get instant feedback
                </div>
                <div className="example-result">✓ Solution verified! Move to next challenge.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="features-container">
          <h2 className="section-title">Everything You Need to Excel</h2>
          <p className="section-description">
            Built with learners in mind, ThinkFlow provides comprehensive tools to master logic programming.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon feature-icon-1"></div>
              <h3 className="feature-title">Interactive Problems</h3>
              <p className="feature-description">
                Tackle real-world logic challenges with our curated problem set. Each problem is designed 
                to strengthen specific aspects of logical thinking.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-2"></div>
              <h3 className="feature-title">Instant Feedback</h3>
              <p className="feature-description">
                Submit your solutions and get immediate validation. Our evaluation engine checks your 
                logic against multiple test cases in real-time.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon feature-icon-3"></div>
              <h3 className="feature-title">Track Progress</h3>
              <p className="feature-description">
                Monitor your improvement with detailed analytics. See your submission history, success 
                rates, and identify areas for growth.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <div className="how-it-works-container">
          <h2 className="section-title">How ThinkFlow Works</h2>
          <p className="section-description">
            Get started in minutes and begin your journey to logic mastery
          </p>
          <div className="steps-grid">
            <div className="step-item">
              <div className="step-number">1</div>
              <h3 className="step-title">Sign Up</h3>
              <p className="step-description">Create your free account in seconds</p>
            </div>
            <div className="step-item">
              <div className="step-number">2</div>
              <h3 className="step-title">Choose Problem</h3>
              <p className="step-description">Browse our curated problem library</p>
            </div>
            <div className="step-item">
              <div className="step-number">3</div>
              <h3 className="step-title">Write Solution</h3>
              <p className="step-description">Code your logic in our editor</p>
            </div>
            <div className="step-item">
              <div className="step-number">4</div>
              <h3 className="step-title">Get Feedback</h3>
              <p className="step-description">Instant validation and insights</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section id="why" className="why">
        <div className="why-container">
          <div>
            <h2 className="section-title" style={{ textAlign: 'left' }}>Why Choose ThinkFlow?</h2>
            <p className="why-intro">
              <strong>Learning logic programming can be challenging.</strong> Traditional courses often lack 
              practical application and immediate feedback. ThinkFlow bridges that gap by providing a 
              hands-on, interactive learning experience.
            </p>
            <div className="why-points">
              <div className="why-point">
                <div className="why-icon why-icon-check"></div>
                <div>
                  <div className="why-point-title">Learn by Doing</div>
                  <p className="why-point-description">
                    Practice with real problems, not just theory
                  </p>
                </div>
              </div>
              <div className="why-point">
                <div className="why-icon why-icon-check"></div>
                <div>
                  <div className="why-point-title">Immediate Validation</div>
                  <p className="why-point-description">
                    Know instantly if your solution works
                  </p>
                </div>
              </div>
              <div className="why-point">
                <div className="why-icon why-icon-check"></div>
                <div>
                  <div className="why-point-title">Progress Tracking</div>
                  <p className="why-point-description">
                    Visualize your growth over time
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="why-stats">
            <div className="stat-card">
              <span className="stat-label">Problems Solved</span>
              <span className="stat-value stat-green">1,240+</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Active Learners</span>
              <span className="stat-value stat-blue">350+</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Success Rate</span>
              <span className="stat-value stat-purple">94%</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="cta-container">
          <h2 className="cta-title">Ready to Master Logic Programming?</h2>
          <p className="cta-description">
            Join hundreds of learners improving their logical thinking skills every day.
          </p>
          <a href="/signup" className="button-primary button-white">
            Create Your Free Account
          </a>
          <p className="cta-note">Start solving problems in under 2 minutes.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-container">
          <div className="footer-brand">
            <div className="brand-icon">
              <Image src="/assets/logo.jpeg" alt="ThinkFlow Logo" width={40} height={40} />
            </div>
            <span className="brand-text">ThinkFlow</span>
            <p className="footer-tagline">Master logic through practice</p>
          </div>
          <div className="footer-links">
            <div className="footer-column">
              <h4 className="footer-heading">Product</h4>
              <ul>
                <li><a href="/problems">Problems</a></li>
                <li><a href="/dashboard">Dashboard</a></li>
                <li><a href="#">Features</a></li>
              </ul>
            </div>
            <div className="footer-column">
              <h4 className="footer-heading">Company</h4>
              <ul>
                <li><a href="#">About</a></li>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Privacy</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 ThinkFlow. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
