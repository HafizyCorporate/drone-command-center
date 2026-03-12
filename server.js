require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Lapis Pertama: Helmet menyembunyikan identitas server dari hacker
app.use(helmet());

// 2. Lapis Kedua: Rate Limiting Anti-DDoS (Maksimal 100 request per 15 menit per IP)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: { error: "Terlalu banyak request, IP Anda diblokir sementara." }
});
app.use(limiter);

app.use(cors());
app.use(express.json({ limit: '5mb' })); // Batasi ukuran payload agar tidak kena buffer overflow

// Middleware Autentikasi Ketat
const verifyDroneKey = (req, res, next) => {
    const droneKey = req.headers['x-drone-secret-key'];
    if (!droneKey || droneKey !== process.env.DRONE_SECRET_KEY) {
        console.warn(`[ALERT] Akses ilegal terdeteksi dari IP: ${req.ip}`);
        // Di sini nanti bisa dipasang trigger kirim email peringatan
        return res.status(401).json({ error: "Akses Ditolak: Kunci Autentikasi Tidak Valid" });
    }
    next();
};

// Endpoint Telemetri (Hanya bisa ditembus jika lolos verifyDroneKey)
app.post('/api/telemetry', verifyDroneKey, (req, res) => {
    const { lat, lng, battery } = req.body;
    
    // Validasi data (Anti Injection/Tipe Data Salah)
    if (typeof lat !== 'number' || typeof lng !== 'number') {
        return res.status(400).json({ error: "Format koordinat tidak valid" });
    }

    console.log(`[TELEMETRI] Drone merespons di Lat: ${lat}, Lng: ${lng} | Baterai: ${battery}%`);
    
    // Nanti kodingan insert ke PostgreSQL (dengan Parameterized Query) ditaruh di sini
    
    res.status(200).json({ message: "Data telemetri aman diterima pusat komando" });
});

app.listen(PORT, () => {
    console.log(`🔥 Sistem Pusat Komando (Secure Mode) aktif di port ${PORT}`);
});
