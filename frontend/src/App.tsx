import {
  Boxes,
  BrainCircuit,
  Check,
  Menu,
  ShoppingBag,
  Ticket,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type Locale = 'id' | 'en';

const locale = (): Locale => (window.location.pathname === '/en' || window.location.pathname.startsWith('/en/') ? 'en' : 'id');

const translations = {
  id: {
    title: 'Pengembangan Software Bisnis | Fluxora Studio',
    description: 'Fluxora Studio merancang dan membangun software bisnis: e-commerce, asisten AI, ERP & logistik, serta e-ticketing. Diskusikan kebutuhan sistem bisnis Anda.',
    switchLabel: 'Switch to English',
    navLabel: 'Navigasi utama',
    menuOpen: 'Buka navigasi',
    menuClose: 'Tutup navigasi',
    nav: ['Layanan', 'Pendekatan', 'Studio', 'FAQ', 'Diskusikan proyek'],
    heroEyebrow: 'PENGEMBANGAN SOFTWARE BISNIS',
    heroTitle: <>Sistem digital yang bergerak <em>seirama</em> dengan bisnis Anda.</>,
    heroDescription: 'Kami merancang dan membangun e-commerce, asisten AI, ERP & logistik, serta e-ticketing sesuai kebutuhan nyata bisnis.',
    primaryCta: 'Diskusikan kebutuhan',
    servicesLink: 'Lihat layanan',
    heroImageAlt: 'Visual abstrak jaringan digital yang menghubungkan beberapa sistem',
    specialties: 'EMPAT AREA KEAHLIAN',
    introLabel: 'TENTANG FLUXORA',
    intro: <>Teknologi seharusnya membantu pekerjaan terasa lebih <em>jelas</em>—mulai dari pengalaman pelanggan hingga proses operasional sehari-hari.</>,
    servicesLabel: 'LAYANAN',
    servicesTitle: <>Empat fokus.<br /><em>Satu arah yang jelas.</em></>,
    servicesIntro: 'Pilih kebutuhan yang paling dekat dengan tantangan bisnis Anda. Ruang lingkup dan fitur disusun sesuai konteks proyek.',
    services: [
      { title: 'E-commerce', description: 'Pengalaman belanja yang rapi bagi pelanggan, dengan alur pesanan yang jelas bagi tim di belakangnya.', capabilities: ['Toko online', 'Katalog & pesanan', 'Integrasi pembayaran'] },
      { title: 'Asisten AI', description: 'Bantuan yang memahami konteks bisnis dan membantu pelanggan atau tim menyelesaikan pekerjaan lebih cepat.', capabilities: ['Asisten pelanggan', 'Basis pengetahuan', 'Otomasi alur kerja'] },
      { title: 'ERP & logistik', description: 'Alur operasional yang menghubungkan stok, pesanan, dan proses pemenuhan sesuai cara tim Anda bekerja.', capabilities: ['Inventaris', 'Operasional pesanan', 'Alur fulfilment'] },
      { title: 'E-ticketing', description: 'Satu alur yang jelas dari pembelian tiket sampai validasi kehadiran di hari acara.', capabilities: ['Penjualan tiket', 'Data peserta', 'Check-in acara'] },
    ],
    discussService: (name: string) => `Diskusikan kebutuhan ${name}`,
    discuss: 'Diskusikan kebutuhan',
    fitEyebrow: 'MEMILIH PENDEKATAN',
    fitTitle: 'Tidak semua masalah perlu dibuatkan sistem baru.',
    fitIntro: 'Solusi terbaik dimulai dari kebutuhan—bukan dari teknologi yang sedang populer.',
    fitOptions: [
      { label: '01 — MULAI SEDERHANA', title: 'Platform siap pakai bisa cukup', body: 'Jika kebutuhan masih umum, alur kerja sederhana, dan produk standar dapat membantu tim mulai lebih cepat.' },
      { label: '02 — PERTIMBANGKAN SISTEM KHUSUS', title: 'Bangun sesuai alur bisnis', body: 'Jika proses penting masih manual, alat yang ada tidak saling terhubung, atau kebutuhan tumbuh di luar batas platform standar.' },
    ],
    approachEyebrow: 'PENDEKATAN',
    approachTitle: <>Pekerjaan yang baik dimulai dengan <em>memahami.</em></>,
    approachIntro: 'Setiap proyek bergerak dari konteks bisnis menuju solusi yang dapat digunakan dan dikembangkan.',
    approachLink: 'Mulai percakapan',
    steps: [
      { title: 'Pahami kebutuhan', description: 'Mulai dari tujuan bisnis, pengguna, alur kerja, dan sistem yang sudah digunakan.' },
      { title: 'Susun arah', description: 'Rangkum ruang lingkup, prioritas, dan pendekatan yang sesuai dengan kebutuhan.' },
      { title: 'Rancang & bangun', description: 'Kembangkan pengalaman dan sistem secara bertahap agar keputusan tetap jelas.' },
      { title: 'Rilis & kembangkan', description: 'Siapkan peluncuran, serah terima, dan dukungan lanjutan sesuai kesepakatan.' },
    ],
    processLabel: 'ALUR PROYEK',
    faqEyebrow: 'PERTANYAAN UMUM',
    faqTitle: <>Sebelum kita<br /><em>mulai bicara.</em></>,
    faqIntro: 'Jawaban singkat untuk membantu Anda memahami langkah awal.',
    faqs: [
      { question: 'Apa saja yang bisa dibangun Fluxora?', answer: 'Fluxora berfokus pada platform e-commerce, asisten AI, sistem ERP dan logistik, serta e-ticketing. Ruang lingkup setiap proyek ditentukan dari kebutuhan dan proses bisnis yang ingin diperbaiki.' },
      { question: 'Bagaimana cara memulai proyek?', answer: 'Mulai dengan menceritakan tujuan dan tantangan yang sedang dihadapi. Setelah kebutuhan awal dipahami, ruang lingkup dan pendekatan proyek dapat dibahas bersama.' },
      { question: 'Apakah Fluxora dapat mengembangkan sistem yang sudah ada?', answer: 'Kemungkinan pengembangan atau integrasi bergantung pada teknologi dan kondisi sistem yang digunakan. Informasi awal tentang sistem tersebut membantu menentukan langkah yang tepat.' },
      { question: 'Bagaimana estimasi biaya dan waktu ditentukan?', answer: 'Estimasi diberikan setelah tujuan, kebutuhan, integrasi, dan prioritas proyek dibahas. Setiap ruang lingkup memiliki kebutuhan yang berbeda.' },
      { question: 'Apakah ada dukungan setelah peluncuran?', answer: 'Kebutuhan pemeliharaan atau pengembangan lanjutan dapat dibahas saat menyusun ruang lingkup dan kesepakatan proyek.' },
    ],
    contactEyebrow: 'LANGKAH BERIKUTNYA',
    contactTitle: <>Ada proses yang ingin Anda <em>perbaiki?</em></>,
    contactBody: 'Ceritakan kebutuhan dan tantangannya. Kita mulai dengan memahami masalah yang perlu diselesaikan.',
    contactButton: 'Hubungi Fluxora',
    emailSubject: 'Diskusi proyek Fluxora',
    footerTagline: 'DIGITAL SYSTEMS, BUILT AROUND YOUR WORK.',
    backToTop: 'KEMBALI KE ATAS',
    backToTopLabel: 'Kembali ke atas',
  },
  en: {
    title: 'Business Software Development | Fluxora Studio',
    description: 'Fluxora Studio designs and builds business software: e-commerce platforms, AI assistants, ERP and logistics systems, and e-ticketing. Tell us what your business needs.',
    switchLabel: 'Beralih ke Bahasa Indonesia',
    navLabel: 'Main navigation',
    menuOpen: 'Open navigation',
    menuClose: 'Close navigation',
    nav: ['Services', 'Approach', 'Studio', 'FAQ', 'Discuss a project'],
    heroEyebrow: 'BUSINESS SOFTWARE DEVELOPMENT',
    heroTitle: <>Digital systems that move <em>in step</em> with your business.</>,
    heroDescription: 'We design and build e-commerce platforms, AI assistants, ERP and logistics systems, and e-ticketing around real business needs.',
    primaryCta: 'Discuss your needs',
    servicesLink: 'Explore services',
    heroImageAlt: 'Abstract digital network connecting several business systems',
    specialties: 'FOUR AREAS OF FOCUS',
    introLabel: 'ABOUT FLUXORA',
    intro: <>Technology should make work feel more <em>clear</em>—from customer experiences to everyday operations.</>,
    servicesLabel: 'SERVICES',
    servicesTitle: <>Four areas.<br /><em>One clear direction.</em></>,
    servicesIntro: 'Choose the area closest to your business challenge. Scope and capabilities are shaped around each project.',
    services: [
      { title: 'E-commerce', description: 'A considered shopping experience for customers, with a clear order flow for the team behind it.', capabilities: ['Online storefronts', 'Catalogues & orders', 'Payment integrations'] },
      { title: 'AI assistants', description: 'Context-aware assistance that helps customers or teams find answers and move work forward.', capabilities: ['Customer support', 'Knowledge bases', 'Workflow automation'] },
      { title: 'ERP & logistics', description: 'Operational workflows connecting inventory, orders, and fulfilment to the way your team works.', capabilities: ['Inventory', 'Order operations', 'Fulfilment workflows'] },
      { title: 'E-ticketing', description: 'A clear journey from ticket purchase through attendee check-in on event day.', capabilities: ['Ticket sales', 'Attendee records', 'Event check-in'] },
    ],
    discussService: (name: string) => `Discuss ${name} needs`,
    discuss: 'Discuss your needs',
    fitEyebrow: 'CHOOSING AN APPROACH',
    fitTitle: 'Not every problem needs a custom system.',
    fitIntro: 'The right solution starts with the need—not with whatever technology is trending.',
    fitOptions: [
      { label: '01 — START SIMPLE', title: 'An existing platform may be enough', body: 'When needs are common and workflows are simple, a standard product can help a team get started.' },
      { label: '02 — CONSIDER CUSTOM SOFTWARE', title: 'Build around your workflow', body: 'When important processes remain manual, tools do not connect, or needs have outgrown standard platforms.' },
    ],
    approachEyebrow: 'OUR APPROACH',
    approachTitle: <>Good work begins with <em>understanding.</em></>,
    approachIntro: 'Each project moves from business context toward a solution people can use and continue to develop.',
    approachLink: 'Start a conversation',
    steps: [
      { title: 'Understand the need', description: 'Start with business goals, users, workflows, and the systems already in place.' },
      { title: 'Set a direction', description: 'Bring together scope, priorities, and an approach shaped around the need.' },
      { title: 'Design & build', description: 'Develop the experience and system in stages, keeping decisions clear.' },
      { title: 'Launch & evolve', description: 'Plan release, handover, and any follow-on support by agreement.' },
    ],
    processLabel: 'PROJECT FLOW',
    faqEyebrow: 'FREQUENTLY ASKED QUESTIONS',
    faqTitle: <>Before we<br /><em>get started.</em></>,
    faqIntro: 'A few answers to help you understand the first step.',
    faqs: [
      { question: 'What can Fluxora build?', answer: 'Fluxora focuses on e-commerce platforms, AI assistants, ERP and logistics systems, and e-ticketing. Project scope is shaped around the business need and workflow to improve.' },
      { question: 'How do we get a project started?', answer: 'Start by sharing your goals and the challenge you are facing. Once we understand the initial need, we can discuss project scope and an appropriate approach.' },
      { question: 'Can Fluxora extend an existing system?', answer: 'The options for development or integration depend on the technology and condition of the system. Some initial context helps determine a sensible next step.' },
      { question: 'How are timeline and cost estimated?', answer: 'We can estimate after discussing goals, requirements, integrations, and priorities. Each project scope has different needs.' },
      { question: 'Is support available after launch?', answer: 'Maintenance or further development can be discussed while defining project scope and terms.' },
    ],
    contactEyebrow: 'THE NEXT STEP',
    contactTitle: <>A process you would like to <em>improve?</em></>,
    contactBody: 'Tell us what you need and what is getting in the way. We can begin by understanding the problem to solve.',
    contactButton: 'Contact Fluxora',
    emailSubject: 'Fluxora project discussion',
    footerTagline: 'DIGITAL SYSTEMS, BUILT AROUND YOUR WORK.',
    backToTop: 'BACK TO TOP',
    backToTopLabel: 'Back to top',
  },
} as const;

const projectStepNumbers = ['01', '02', '03', '04'];

function App() {
  const currentLocale = locale();
  const t = translations[currentLocale];
  const isEnglish = currentLocale === 'en';
  const languageHref = isEnglish ? '/' : '/en/';
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    document.documentElement.lang = isEnglish ? 'en' : 'id';
    document.title = t.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', t.description);
  }, [isEnglish, t.description, t.title]);

  return (
    <main id="top">
      <header className="site-header">
        <a className="brand" href="#top" aria-label={isEnglish ? 'Fluxora Studio, home' : 'Fluxora Studio, halaman utama'} onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">fluxora<span>studio</span></span>
        </a>

        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? t.menuClose : t.menuOpen}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav id="primary-navigation" className={menuOpen ? 'primary-nav is-open' : 'primary-nav'} aria-label={t.navLabel}>
          <a href="#layanan" onClick={closeMenu}>{t.nav[0]}</a>
          <a href="#pendekatan" onClick={closeMenu}>{t.nav[1]}</a>
          <a href="#studio" onClick={closeMenu}>{t.nav[2]}</a>
          <a href="#faq" onClick={closeMenu}>{t.nav[3]}</a>
          <a className="language-toggle" href={languageHref} lang={isEnglish ? 'id' : 'en'} aria-label={t.switchLabel} onClick={closeMenu}>{isEnglish ? 'ID' : 'EN'}</a>
          <a className="nav-contact" href="#kontak" onClick={closeMenu}>{t.nav[4]}</a>
        </nav>
      </header>

      <section className="hero page-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> {t.heroEyebrow} <b>·</b> FLUXORA</p>
          <h1 id="hero-title">{t.heroTitle}</h1>
          <p className="hero-description">{t.heroDescription}</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#kontak">{t.primaryCta}</a>
            <a className="text-link" href="#layanan">{t.servicesLink}</a>
          </div>
          <div className="hero-note"><span>{isEnglish ? 'STRATEGY' : 'STRATEGI'}</span><i /><span>{isEnglish ? 'DESIGN' : 'DESAIN'}</span><i /><span>ENGINEERING</span></div>
        </div>

        <figure className="hero-visual">
          <div className="hero-visual-backdrop" />
          <img src="/fluxora-network.png" alt={t.heroImageAlt} />
          <figcaption><span>FLUXORA STUDIO</span><span>{t.specialties}</span></figcaption>
          <span className="visual-index" aria-hidden="true">F—01</span>
        </figure>
        <div className="hero-bottomline" aria-hidden="true"><span>SOFTWARE BUILT AROUND THE WORK</span><span>01 — 04</span></div>
      </section>

      <section className="studio-intro" id="studio">
        <div className="section-label"><span>01</span><span>{t.introLabel}</span></div>
        <p>{t.intro}</p>
        <span className="intro-seal" aria-hidden="true">F<span>.</span></span>
      </section>

      <section className="services page-shell" id="layanan" aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> {t.servicesLabel}</p>
            <h2 id="services-title">{t.servicesTitle}</h2>
          </div>
          <p className="section-intro">{t.servicesIntro}</p>
        </div>
        <div className="service-grid">
          {t.services.map(({ title, description, capabilities }, index) => {
            const Icon = [ShoppingBag, BrainCircuit, Boxes, Ticket][index];
            const number = projectStepNumbers[index];
            return (
              <article className="service-card" key={number}>
                <div className="service-card-top"><span>{number} / 04</span><Icon size={22} strokeWidth={1.5} aria-hidden="true" /></div>
                <h3>{title}</h3>
                <p>{description}</p>
                <ul>{capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
                <a href="#kontak" aria-label={t.discussService(title)}>{t.discuss} <span aria-hidden="true">+</span></a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fit-check" aria-labelledby="fit-title">
        <div className="fit-inner page-shell">
          <div className="fit-heading">
            <p className="eyebrow"><span /> {t.fitEyebrow}</p>
            <h2 id="fit-title">{t.fitTitle}</h2>
            <p>{t.fitIntro}</p>
          </div>
          <div className="fit-columns">
            {t.fitOptions.map(({ label, title, body }, index) => (
              <article className={index === 1 ? 'fit-custom' : undefined} key={label}>
                <span className="fit-index">{label}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="approach" id="pendekatan" aria-labelledby="approach-title">
        <div className="approach-inner page-shell">
          <div className="approach-heading">
            <p className="eyebrow"><span /> {t.approachEyebrow}</p>
            <h2 id="approach-title">{t.approachTitle}</h2>
            <p>{t.approachIntro}</p>
            <a className="approach-link" href="#kontak">{t.approachLink} <span aria-hidden="true">+</span></a>
          </div>
          <div className="steps-list">
            {t.steps.map(({ title, description }, index) => (
              <article className="step" key={projectStepNumbers[index]}>
                <span className="step-number">{projectStepNumbers[index]}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
                <Check size={16} aria-hidden="true" />
              </article>
            ))}
          </div>
          <div className="approach-footer"><span>{t.processLabel}</span><span className="approach-rule" /><span>01 — 04</span></div>
        </div>
      </section>

      <section className="faq page-shell" id="faq" aria-labelledby="faq-title">
        <div className="faq-heading">
          <p className="eyebrow"><span /> {t.faqEyebrow}</p>
          <h2 id="faq-title">{t.faqTitle}</h2>
          <p>{t.faqIntro}</p>
        </div>
        <div className="faq-list">
          {t.faqs.map(({ question, answer }) => (
            <details key={question}>
              <summary>{question}<span aria-hidden="true">+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="contact" id="kontak" aria-labelledby="contact-title">
        <div className="contact-inner page-shell">
          <div className="contact-copy">
            <p className="eyebrow"><span /> {t.contactEyebrow}</p>
            <h2 id="contact-title">{t.contactTitle}</h2>
            <p>{t.contactBody}</p>
            <a className="button button-light" href={`mailto:hello@fluxorastudio.id?subject=${encodeURIComponent(t.emailSubject)}`}>{t.contactButton}</a>
          </div>
          <div className="contact-aside" aria-hidden="true"><span>F</span><i /><i /><i /></div>
        </div>
      </section>

      <footer className="site-footer page-shell">
        <a className="brand" href="#top" aria-label={t.backToTopLabel}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">fluxora<span>studio</span></span>
        </a>
        <span className="footer-caption">{t.footerTagline}</span>
        <a className="back-to-top" href="#top">{t.backToTop}</a>
        <span className="copyright">© {new Date().getFullYear()} FLUXORA STUDIO</span>
      </footer>
    </main>
  );
}

export default App;
