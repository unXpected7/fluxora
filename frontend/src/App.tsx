import { ArrowDown, ArrowUpRight, ArrowRight, Box, BrainCircuit, Menu, Ticket, X, Route } from 'lucide-react';
import { useState } from 'react';

const offerings = [
  {
    number: '01',
    icon: Box,
    title: 'E-commerce',
    description: 'A storefront that does more than look good. We build the commerce engine behind a smoother path from discovery to delivery.',
    tags: ['Storefronts', 'Payments', 'Operations'],
  },
  {
    number: '02',
    icon: BrainCircuit,
    title: 'AI assistants',
    description: 'Give customers and teams a faster way to get things done with AI assistants grounded in your real workflows and knowledge.',
    tags: ['Conversational AI', 'Knowledge systems', 'Automation'],
  },
  {
    number: '03',
    icon: Route,
    title: 'ERP & logistics',
    description: 'Connect inventory, fulfilment, and the people doing the work in one dependable operational system.',
    tags: ['ERP', 'Inventory', 'Logistics'],
  },
  {
    number: '04',
    icon: Ticket,
    title: 'E-ticketing',
    description: 'Make every event easier to discover, book, and enter with ticketing built around your audience and operations.',
    tags: ['Ticket sales', 'Check-in', 'Event operations'],
  },
];

const steps = [
  ['01', 'Get clear', 'We map the real problem, the people around it, and the outcome your team needs.'],
  ['02', 'Build together', 'Small, focused releases make progress visible and decisions easier to make.'],
  ['03', 'Keep improving', 'We stay close after launch, using what we learn to make the system work harder.'],
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Fluxora Studio home" onClick={closeMenu}>
          <span className="brand-mark"><i /><i /><i /></span>
          <span>fluxora<span className="brand-light">studio</span></span>
        </a>
        <button className="menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <nav className={menuOpen ? 'nav nav-open' : 'nav'} aria-label="Main navigation">
          <a href="#services" onClick={closeMenu}>What we build</a>
          <a href="#approach" onClick={closeMenu}>How we work</a>
          <a href="#about" onClick={closeMenu}>Studio</a>
          <a className="nav-cta" href="#contact" onClick={closeMenu}>Start a conversation <ArrowUpRight size={15} /></a>
        </nav>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-rule" /> DIGITAL PRODUCT STUDIO <span className="eyebrow-loc">JAKARTA · INDONESIA</span></p>
          <h1>Digital systems,<br /><span>made to move.</span></h1>
          <p className="hero-lede">We turn complex operations into clear, capable software — from the first customer click to the work happening behind the scenes.</p>
          <div className="hero-actions">
            <a href="#services" className="button button-primary">Explore our services <ArrowDown size={16} /></a>
            <a href="#approach" className="text-link">Our approach <ArrowRight size={15} /></a>
          </div>
          <div className="hero-foot"><span>PRODUCT STRATEGY</span><b>·</b><span>DESIGN</span><b>·</b><span>ENGINEERING</span></div>
        </div>
        <div className="hero-art" aria-label="Abstract visualization of connected digital systems" role="img">
          <img className="hero-image" src="/fluxora-network.png" alt="" />
          <div className="art-grid" />
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-orbit orbit-three" />
          <div className="art-core"><span>FLUX</span><strong>↗</strong></div>
          <div className="art-node node-commerce"><Box size={16} /><span>COMMERCE</span></div>
          <div className="art-node node-ai"><BrainCircuit size={16} /><span>INTELLIGENCE</span></div>
          <div className="art-node node-ops"><Route size={16} /><span>OPERATIONS</span></div>
          <div className="art-node node-ticket"><Ticket size={16} /><span>EXPERIENCES</span></div>
          <div className="art-coordinate coord-a">06°12' S / 106°49' E</div>
          <div className="art-coordinate coord-b">SYSTEM MAP / 001</div>
          <span className="art-spark spark-a" /><span className="art-spark spark-b" /><span className="art-spark spark-c" />
        </div>
        <div className="hero-index"><span>01 / 04</span><span className="index-line" /><span>BUILT FOR WHAT'S NEXT</span></div>
      </section>

      <section className="intro-strip" id="about">
        <span className="section-kicker">THE STUDIO</span>
        <p>Good software makes the complicated feel <em>obvious.</em> We partner with ambitious teams to build the tools that let their ideas move at full speed.</p>
        <span className="intro-mark">F<span>.</span></span>
      </section>

      <section className="services section-pad" id="services">
        <div className="section-heading">
          <div><p className="eyebrow"><span className="eyebrow-rule" /> WHAT WE BUILD</p><h2>One partner.<br /><span>Four ways forward.</span></h2></div>
          <p className="section-aside">Purpose-built digital products, designed around the people and processes that make your business run.</p>
        </div>
        <div className="service-grid">
          {offerings.map(({ number, icon: Icon, title, description, tags }) => (
            <article className="service-card" key={number}>
              <div className="service-top"><span className="service-number">{number} / 04</span><Icon size={20} strokeWidth={1.5} /></div>
              <h3>{title}</h3>
              <p>{description}</p>
              <div className="service-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <a className="card-link" href="#contact" aria-label={`Discuss ${title}`}><ArrowUpRight size={18} /></a>
            </article>
          ))}
        </div>
      </section>

      <section className="approach section-pad" id="approach">
        <div className="approach-head"><p className="eyebrow"><span className="eyebrow-rule" /> HOW WE WORK</p><h2>Clarity first.<br /><span>Momentum always.</span></h2></div>
        <div className="steps">
          {steps.map(([number, title, text]) => <article className="step" key={number}><span className="step-no">{number}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}
        </div>
        <div className="approach-bottom"><span>FROM FIRST CONVERSATION TO WHAT'S NEXT</span><span className="approach-line" /><span>01 — 03</span></div>
      </section>

      <section className="contact section-pad" id="contact">
        <div className="contact-orb" aria-hidden="true"><span /><span /><span /></div>
        <div className="contact-content"><p className="eyebrow"><span className="eyebrow-rule" /> YOUR NEXT CHAPTER</p><h2>Have a big<br />thing in mind?</h2><p>Tell us what you're trying to make possible. We'll help you figure out the next move.</p><a className="button button-light" href="mailto:hello@fluxorastudio.id?subject=Let%27s%20build%20something">Start a conversation <ArrowUpRight size={16} /></a></div>
        <div className="contact-side"><span>FLUXORA STUDIO</span><span>BUILDING DIGITAL SYSTEMS<br />FOR AMBITIOUS TEAMS.</span><span>JAKARTA, INDONESIA<br />WORKING EVERYWHERE.</span></div>
      </section>

      <footer className="footer"><a className="brand" href="#top"><span className="brand-mark"><i /><i /><i /></span><span>fluxora<span className="brand-light">studio</span></span></a><span>© 2026 FLUXORA STUDIO</span><a href="#top">BACK TO TOP ↑</a></footer>
    </main>
  );
}

export default App;
