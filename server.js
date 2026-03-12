require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
    } catch (err) {
        console.error(err);
    }
};
initDB();

app.use(helmet({ contentSecurityPolicy: false })); 
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Limit diperbesar untuk menampung foto!

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const verifyDroneKey = (req, res, next) => {
    const droneKey = req.headers['x-drone-secret-key'];
    if (!droneKey || droneKey !== process.env.DRONE_SECRET_KEY) {
        return res.status(401).json({ error: "Akses Ditolak!" });
    }
    next();
};

app.post('/api/telemetry', verifyDroneKey, async (req, res) => {
    const { lat, lng, alt, battery, image } = req.body;
    
    try {
        const insertQuery = `INSERT INTO telemetri_drone (latitude, longitude, ketinggian, baterai) VALUES ($1, $2, $3, $4) RETURNING id;`;
        const result = await pool.query(insertQuery, [lat, lng, alt || 0, battery || 100]);
        
        console.log(`[DATA MASUK] Wahana ID Log: ${result.rows[0].id}`);

        // --- JEMBATAN BARU: Lempar foto ke Python YOLO ---
        if (image && process.env.VISION_API_URL) {
            console.log("[VISION] Mengirim foto ke Otak AI YOLO...");
            // Menembak data ke server Python secara otomatis
            fetch(process.env.VISION_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: image })
            }).catch(err => console.error("[VISION ERROR] AI belum siap/gagal dihubungi."));
        }

        res.status(200).json({ message: "Telemetri diamankan", id: result.rows[0].id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(PORT, () => {
    console.log(`🔥 Pusat Komando aktif di port ${PORT}`);
});
