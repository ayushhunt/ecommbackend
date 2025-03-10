import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import prisma from './config/prisma';


// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json()); 
app.use(cors()); 
app.use(morgan('dev')); 



app.get('/test', async (req, res) => {
    const users = await prisma.test.create({
        data: {
            name:"testboy",
            email:"testboy@gmail.com"
        }
    });
    res.json(users);
  });

// Server Listening
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
