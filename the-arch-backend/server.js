
  // server.js
  const express = require('express');
  const mongoose = require('mongoose');
  const cors = require('cors');
  const http = require('http');
  const socketIo = require('socket.io');
  const cron = require('node-cron');
  require('dotenv').config();
  
  const authRoutes = require('./routes/auth');
  const userRoutes = require('./routes/users');
  const archRoutes = require('./routes/arches');
  const questionRoutes = require('./routes/questions');
  const responseRoutes = require('./routes/responses');
  const postRoutes = require('./routes/posts');
  const getTogetherRoutes = require('./routes/gettogethers');
  const messageRoutes = require('./routes/messages');
  
  const { sendDailyQuestions, processDailyResponses } = require('./services/dailyQuestionService');
  
  const app = express();
  const server = http.createServer(app);
  const io = socketIo(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-arch', (archId) => {
      socket.join(archId);
    });
    
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
  
  // Make io available to routes
  app.set('io', io);
  
  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/arches', archRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/responses', responseRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/gettogethers', getTogetherRoutes);
  app.use('/api/messages', messageRoutes);
  
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'The Arch API is running' });
  });
  
  // Daily question cron jobs
  // Send questions at 6 AM ET
  cron.schedule('0 6 * * *', () => {
    console.log('Sending daily questions...');
    sendDailyQuestions();
  }, {
    timezone: "America/New_York"
  });
  
  // Process responses at 5 PM ET
  cron.schedule('0 17 * * *', () => {
    console.log('Processing daily responses...');
    processDailyResponses();
  }, {
    timezone: "America/New_York"
  });
  
  // Connect to MongoDB
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/the-arch')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`The Arch API server running on port ${PORT}`);
  });
  
  