require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path'); // Tambahan senjata pembuka folder

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. SETUP DATABASE ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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
        console.log("✅ Database PostgreSQL siap!");
    } catch (err) {
        console.error("❌ Gagal inisialisasi database:", err);
    }
};
initDB();

// --- 2. TEMBOK PERTAHANAN ---
// Matikan sementara CSP agar tampilan web di HP tidak diblokir
app.use(helmet({ contentSecurityPolicy: false })); 
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Terlalu banyak request, IP diblokir." }
});
app.use('/api/', limiter);

// --- 3. JALUR ANTARMUKA (UI) ---
// Paksa Express membaca folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Rute paksa: Kalau buka link utama, langsung tampilkan antarmuka!
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 4. JANTUNG PUSAT KOMANDO (API) ---
const verifyDroneKey = (req, res, next) => {
    const droneKey = req.headers['x-drone-secret-key'];
    if (!droneKey || droneKey !== process.env.DRONE_SECRET_KEY) {
        return res.status(401).json({ error: "Akses Ditolak: Kunci Autentikasi Bodong!" });
    }
    next();
};

app.post('/api/telemetry', verifyDroneKey, async (req, res) => {
    const { lat, lng, alt, battery } = req.body;
    
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: "Format koordinat rusak" });
    }

    try {
        const insertQuery = `
            INSERT INTO telemetri_drone (latitude, longitude, ketinggian, baterai)
            VALUES ($1, $2, $3, $4) RETURNING id;
        `;
        const values = [lat, lng, alt || 0, battery || 100];
        
        const result = await pool.query(insertQuery, values);
        console.log(`[DATA MASUK] Wahana ID Log: ${result.rows[0].id}`);
        res.status(200).json({ message: "Telemetri berhasil diamankan", id: result.rows[0].id });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(PORT, () => {
    console.log(`🔥 Pusat Komando aktif di port ${PORT}`);
});
