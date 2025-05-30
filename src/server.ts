import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import {prisma } from './config/prisma';

import authRouter from './routes/auth';
import productRouter from './routes/product';
import { authenticate } from './middlewares/auth.middleware';
import dbConnect from './config/mdb';
import orderRouter from './routes/order';
import reviewRouter from './routes/review';
import cartRouter from './routes/cart';
import wishlistRouter from './routes/wishlist'
import recommendationRouter from './routes/recommendation';
import profileRouter from './routes/profile';

// Load environment variables
dotenv.config();
dbConnect();

const app = express();

// Middleware
app.use(express.json()); 
const allowedOrigins = [
  "http://localhost:3003",       // local dev
  "http://69.62.85.32:3003",     // public IP
  "https://relot.in",      // optional, if domain is used
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev')); 

// Routes
app.use('/auth', authRouter);
app.use('/v1',  productRouter);
app.use('/v1',orderRouter)
app.use('/v1',reviewRouter);
app.use("/v1",cartRouter)
app.use("/v1/wish",authenticate,wishlistRouter);
app.use("/v1/rec",recommendationRouter);
app.use("/v1/user",authenticate,profileRouter)

// Protected route example
// app.get('/profile', authenticate, (req, res) => {
//   res.json({ user: req.user });
// });







//prisma connect
app.get('/prismaconnect', async (req, res) => {
    const users = await prisma.test.create({
        data: {
            name:"testboy",
            email:"testboy@gmail.com"
        }
    });
    res.json(users);
});


//monogo connect
app.get('/mongoconnect', async (req, res) => {
    dbConnect();
    res.json({ message: 'MongoDB connected successfully' });
});




// Server Listening
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
