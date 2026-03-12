require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg'); // Senjata untuk nyambung ke PostgreSQL

const app = express();
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;

// --- 1. SETUP DATABASE (ANTI SQL INJECTION) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Wajib untuk server cloud modern
});

// Fungsi pintar: Bikin tabel otomatis kalau belum ada
const initDB = async () => {
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS telemetri_drone (
            id SERIAL PRIMARY KEY,
            latitude DECIMAL NOT NULL,
            longitude DECIMAL NOT NULL,
            ketinggian DECIMAL,
            baterai INTEGER,
            waktu TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    try {
        await pool.query(createTableQuery);
        console.log("✅ Database PostgreSQL siap dan aman dari injeksi!");
    } catch (err) {
        console.error("❌ Gagal inisialisasi database:", err);
    }
};
initDB();

// --- 2. TEMBOK PERTAHANAN (ANTI DDOS & SNIFFING) ---
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Terlalu banyak request, IP Anda diblokir sementara." }
});
app.use('/api/', limiter);

// Middleware Pengecek Kunci Gembok
const verifyDroneKey = (req, res, next) => {
    const droneKey = req.headers['x-drone-secret-key'];
    if (!droneKey || droneKey !== process.env.DRONE_SECRET_KEY) {
        console.warn(`[ALERT SECURITY] Serangan ditangkis dari IP: ${req.ip}`);
        return res.status(401).json({ error: "Akses Ditolak: Kunci Autentikasi Bodong!" });
    }
    next();
};

// --- 3. JANTUNG PUSAT KOMANDO ---
app.post('/api/telemetry', verifyDroneKey, async (req, res) => {
    const { lat, lng, alt, battery } = req.body;
    
    // Validasi tipe data ketat (Hanya terima angka)
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: "Format koordinat rusak/dimanipulasi" });
    }

    try {
        // Eksekusi Parameterized Query (Hacker nangis lihat ini)
        const insertQuery = `
            INSERT INTO telemetri_drone (latitude, longitude, ketinggian, baterai)
            VALUES ($1, $2, $3, $4) RETURNING id;
        `;
        const values = [lat, lng, alt || 0, battery || 100];
        
        const result = await pool.query(insertQuery, values);
        
        console.log(`[DATA MASUK] Wahana ID Log: ${result.rows[0].id} | Kordinat Aman.`);
        res.status(200).json({ message: "Telemetri berhasil diamankan", id: result.rows[0].id });
    } catch (err) {
        console.error("[ERROR SERVER]", err);
        res.status(500).json({ error: "Sistem pusat komando sedang gangguan" });
    }
});

app.listen(PORT, () => {
    console.log(`🔥 Sistem Pusat Komando (Secure Mode) aktif di port ${PORT}`);
});
