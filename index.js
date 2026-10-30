const express = require("express");
const dotenv = require("dotenv");
const { AccessToken } = require("livekit-server-sdk");

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");

dotenv.config();

const app = express();
app.use(express.json({ limit: "10kb" }));

const serviceAccount = require("./firebase-admin.json");

const firebaseApp = initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://entre-nosotros-ad39e-default-rtdb.firebaseio.com/"
});

const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);

app.get("/", (req, res) => {
    res.send("Servidor de voz de Entre Nosotros funcionando ❤️");
});

app.post("/token", async (req, res) => {
    try {
        const authorization = req.headers.authorization || "";

        if (!authorization.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Falta la autenticación de Firebase"
            });
        }

        const idToken = authorization.substring(7);
        const decoded = await auth.verifyIdToken(idToken);
        const uid = decoded.uid;

        const { roomCode } = req.body;

        if (!roomCode || !/^\d{4}$/.test(String(roomCode))) {
            return res.status(400).json({
                error: "Código de sala inválido"
            });
        }

        const snapshot = await db
            .ref(`rooms/${roomCode}/players/${uid}`)
            .once("value");

        if (!snapshot.exists()) {
            return res.status(403).json({
                error: "No perteneces a esta sala"
            });
        }

        const playerData = snapshot.val();
        const playerName = typeof playerData === "object"
            ? playerData.name
            : playerData;

        if (!playerName || typeof playerName !== "string") {
            return res.status(400).json({
                error: "Nombre de jugador inválido"
            });
        }

        if (!process.env.LIVEKIT_URL ||
            !process.env.LIVEKIT_API_KEY ||
            !process.env.LIVEKIT_API_SECRET) {
            throw new Error("Faltan variables de LiveKit");
        }

        const token = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            {
                identity: uid,
                name: playerName,
                ttl: "1h"
            }
        );

        token.addGrant({
            roomJoin: true,
            room: String(roomCode),
            canPublish: true,
            canSubscribe: true
        });

        const jwt = await token.toJwt();

        res.json({
            token: jwt,
            url: process.env.LIVEKIT_URL,
            roomName: String(roomCode)
        });

    } catch (error) {
        console.error("Error generando token:", error.message);

        res.status(500).json({
            error: "No se pudo autorizar la conexión de voz"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log("Servidor de voz iniciado en puerto " + PORT);
});
