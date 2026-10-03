import {
  Boxes,
  BrainCircuit,
  Check,
  Menu,
  ShoppingBag,
  Ticket,
  X,
} from 'lucide-react';
import { useState } from 'react';

const services = [
  {
    number: '01',
    icon: ShoppingBag,
    title: 'E-commerce',
    description:
      'Pengalaman belanja yang rapi bagi pelanggan, dengan alur pesanan yang jelas bagi tim di belakangnya.',
    capabilities: ['Toko online', 'Katalog & pesanan', 'Integrasi pembayaran'],
  },
  {
    number: '02',
    icon: BrainCircuit,
    title: 'Asisten AI',
    description:
      'Bantuan yang memahami konteks bisnis dan membantu pelanggan atau tim menyelesaikan pekerjaan lebih cepat.',
    capabilities: ['Asisten pelanggan', 'Basis pengetahuan', 'Otomasi alur kerja'],
  },
  {
    number: '03',
    icon: Boxes,
    title: 'ERP & logistik',
    description:
      'Alur operasional yang menghubungkan stok, pesanan, dan proses pemenuhan sesuai cara tim Anda bekerja.',
    capabilities: ['Inventaris', 'Operasional pesanan', 'Alur fulfilment'],
  },
  {
    number: '04',
    icon: Ticket,
    title: 'E-ticketing',
    description:
      'Satu alur yang jelas dari pembelian tiket sampai validasi kehadiran di hari acara.',
    capabilities: ['Penjualan tiket', 'Data peserta', 'Check-in acara'],
  },
];

const projectSteps = [
  {
    number: '01',
    title: 'Pahami kebutuhan',
    description:
      'Mulai dari tujuan bisnis, pengguna, alur kerja, dan sistem yang sudah digunakan.',
  },
  {
    number: '02',
    title: 'Susun arah',
    description:
      'Rangkum ruang lingkup, prioritas, dan pendekatan yang sesuai dengan kebutuhan.',
  },
  {
    number: '03',
    title: 'Rancang & bangun',
    description:
      'Kembangkan pengalaman dan sistem secara bertahap agar keputusan tetap jelas.',
  },
  {
    number: '04',
    title: 'Rilis & kembangkan',
    description:
      'Siapkan peluncuran, serah terima, dan dukungan lanjutan sesuai kesepakatan.',
  },
];

const faqs = [
  {
    question: 'Apa saja yang bisa dibangun Fluxora?',
    answer:
      'Fluxora berfokus pada platform e-commerce, asisten AI, sistem ERP dan logistik, serta e-ticketing. Ruang lingkup setiap proyek ditentukan dari kebutuhan dan proses bisnis yang ingin diperbaiki.',
  },
  {
    question: 'Bagaimana cara memulai proyek?',
    answer:
      'Mulai dengan menceritakan tujuan dan tantangan yang sedang dihadapi. Setelah kebutuhan awal dipahami, ruang lingkup dan pendekatan proyek dapat dibahas bersama.',
  },
  {
    question: 'Apakah Fluxora dapat mengembangkan sistem yang sudah ada?',
    answer:
      'Kemungkinan pengembangan atau integrasi bergantung pada teknologi dan kondisi sistem yang digunakan. Informasi awal tentang sistem tersebut membantu menentukan langkah yang tepat.',
  },
  {
    question: 'Bagaimana estimasi biaya dan waktu ditentukan?',
    answer:
      'Estimasi diberikan setelah tujuan, kebutuhan, integrasi, dan prioritas proyek dibahas. Setiap ruang lingkup memiliki kebutuhan yang berbeda.',
  },
  {
    question: 'Apakah ada dukungan setelah peluncuran?',
    answer:
      'Kebutuhan pemeliharaan atau pengembangan lanjutan dapat dibahas saat menyusun ruang lingkup dan kesepakatan proyek.',
  },
];

function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <main id="top">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Fluxora Studio, halaman utama" onClick={closeMenu}>
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">fluxora<span>studio</span></span>
        </a>

        <button
          className="menu-toggle"
          type="button"
          aria-label={menuOpen ? 'Tutup navigasi' : 'Buka navigasi'}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>

        <nav id="primary-navigation" className={menuOpen ? 'primary-nav is-open' : 'primary-nav'} aria-label="Navigasi utama">
          <a href="#layanan" onClick={closeMenu}>Layanan</a>
          <a href="#pendekatan" onClick={closeMenu}>Pendekatan</a>
          <a href="#studio" onClick={closeMenu}>Studio</a>
          <a href="#faq" onClick={closeMenu}>FAQ</a>
          <a className="nav-contact" href="#kontak" onClick={closeMenu}>Diskusikan proyek</a>
        </nav>
      </header>

      <section className="hero page-shell" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow"><span /> DIGITAL PRODUCT STUDIO <b>·</b> FLUXORA</p>
          <h1 id="hero-title">Sistem digital yang bergerak <em>seirama</em> dengan bisnis Anda.</h1>
          <p className="hero-description">
            Kami merancang dan membangun e-commerce, asisten AI, ERP & logistik, serta e-ticketing sesuai kebutuhan nyata bisnis.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#kontak">Diskusikan kebutuhan</a>
            <a className="text-link" href="#layanan">Lihat layanan</a>
          </div>
          <div className="hero-note"><span>STRATEGI</span><i /><span>DESAIN</span><i /><span>ENGINEERING</span></div>
        </div>

        <figure className="hero-visual">
          <div className="hero-visual-backdrop" />
          <img src="/fluxora-network.png" alt="Visual abstrak jaringan digital yang menghubungkan beberapa sistem" />
          <figcaption><span>FLUXORA STUDIO</span><span>EMPAT AREA KEAHLIAN</span></figcaption>
          <span className="visual-index" aria-hidden="true">F—01</span>
        </figure>
        <div className="hero-bottomline" aria-hidden="true"><span>SOFTWARE BUILT AROUND THE WORK</span><span>01 — 04</span></div>
      </section>

      <section className="studio-intro" id="studio">
        <div className="section-label"><span>01</span><span>TENTANG FLUXORA</span></div>
        <p>
          Teknologi seharusnya membantu pekerjaan terasa lebih <em>jelas</em>—mulai dari pengalaman pelanggan hingga proses operasional sehari-hari.
        </p>
        <span className="intro-seal" aria-hidden="true">F<span>.</span></span>
      </section>

      <section className="services page-shell" id="layanan" aria-labelledby="services-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> LAYANAN</p>
            <h2 id="services-title">Empat fokus.<br /><em>Satu arah yang jelas.</em></h2>
          </div>
          <p className="section-intro">
            Pilih kebutuhan yang paling dekat dengan tantangan bisnis Anda. Ruang lingkup dan fitur disusun sesuai konteks proyek.
          </p>
        </div>
        <div className="service-grid">
          {services.map(({ number, icon: Icon, title, description, capabilities }) => (
            <article className="service-card" key={number}>
              <div className="service-card-top"><span>{number} / 04</span><Icon size={22} strokeWidth={1.5} aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{description}</p>
              <ul>{capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul>
              <a href="#kontak" aria-label={`Diskusikan kebutuhan ${title}`}>Diskusikan kebutuhan <span aria-hidden="true">+</span></a>
            </article>
          ))}
        </div>
      </section>

      <section className="fit-check" aria-labelledby="fit-title">
        <div className="fit-inner page-shell">
          <div className="fit-heading">
            <p className="eyebrow"><span /> MEMILIH PENDEKATAN</p>
            <h2 id="fit-title">Tidak semua masalah perlu dibuatkan sistem baru.</h2>
            <p>Solusi terbaik dimulai dari kebutuhan—bukan dari teknologi yang sedang populer.</p>
          </div>
          <div className="fit-columns">
            <article>
              <span className="fit-index">01 — MULAI SEDERHANA</span>
              <h3>Platform siap pakai bisa cukup</h3>
              <p>Jika kebutuhan masih umum, alur kerja sederhana, dan produk standar dapat membantu tim mulai lebih cepat.</p>
            </article>
            <article className="fit-custom">
              <span className="fit-index">02 — PERTIMBANGKAN SISTEM KHUSUS</span>
              <h3>Bangun sesuai alur bisnis</h3>
              <p>Jika proses penting masih manual, alat yang ada tidak saling terhubung, atau kebutuhan tumbuh di luar batas platform standar.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="approach" id="pendekatan" aria-labelledby="approach-title">
        <div className="approach-inner page-shell">
          <div className="approach-heading">
            <p className="eyebrow"><span /> PENDEKATAN</p>
            <h2 id="approach-title">Pekerjaan yang baik dimulai dengan <em>memahami.</em></h2>
            <p>Setiap proyek bergerak dari konteks bisnis menuju solusi yang dapat digunakan dan dikembangkan.</p>
            <a className="approach-link" href="#kontak">Mulai percakapan <span aria-hidden="true">+</span></a>
          </div>
          <div className="steps-list">
            {projectSteps.map(({ number, title, description }) => (
              <article className="step" key={number}>
                <span className="step-number">{number}</span>
                <div><h3>{title}</h3><p>{description}</p></div>
                <Check size={16} aria-hidden="true" />
              </article>
            ))}
          </div>
          <div className="approach-footer"><span>ALUR PROYEK</span><span className="approach-rule" /><span>01 — 04</span></div>
        </div>
      </section>

      <section className="faq page-shell" id="faq" aria-labelledby="faq-title">
        <div className="faq-heading">
          <p className="eyebrow"><span /> PERTANYAAN UMUM</p>
          <h2 id="faq-title">Sebelum kita<br /><em>mulai bicara.</em></h2>
          <p>Jawaban singkat untuk membantu Anda memahami langkah awal.</p>
        </div>
        <div className="faq-list">
          {faqs.map(({ question, answer }) => (
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
            <p className="eyebrow"><span /> LANGKAH BERIKUTNYA</p>
            <h2 id="contact-title">Ada proses yang ingin Anda <em>perbaiki?</em></h2>
            <p>Ceritakan kebutuhan dan tantangannya. Kita mulai dengan memahami masalah yang perlu diselesaikan.</p>
            <a className="button button-light" href="mailto:hello@fluxorastudio.id?subject=Diskusi%20proyek%20Fluxora">Hubungi Fluxora</a>
          </div>
          <div className="contact-aside" aria-hidden="true"><span>F</span><i /><i /><i /></div>
        </div>
      </section>

      <footer className="site-footer page-shell">
        <a className="brand" href="#top" aria-label="Kembali ke atas">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span className="brand-name">fluxora<span>studio</span></span>
        </a>
        <span className="footer-caption">DIGITAL SYSTEMS, BUILT AROUND YOUR WORK.</span>
        <a className="back-to-top" href="#top">KEMBALI KE ATAS</a>
        <span className="copyright">© {new Date().getFullYear()} FLUXORA STUDIO</span>
      </footer>
    </main>
  );
}

export default App;
