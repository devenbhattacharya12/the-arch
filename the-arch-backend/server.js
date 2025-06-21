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

// Import the daily question service
const dailyQuestionService = require('./services/dailyQuestionService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
// Add this debugging middleware to server.js BEFORE your routes
app.use('/api/gettogethers', (req, res, next) => {
  console.log('\n🎯 GET-TOGETHERS ROUTE HIT:');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Full Path:', req.path);
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Bearer [TOKEN]' : 'No auth'
  });
  console.log('Body:', req.body);
  console.log('Files:', req.files ? `${req.files.length} files` : 'No files');
  console.log('File (single):', req.file ? 'File present' : 'No file');
  console.log('---\n');
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', require('./routes/dashboard'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Join user to their personal room (for user-specific notifications)
  socket.on('join-user-room', (userId) => {
    socket.join(`user-${userId}`);
    console.log(`User ${userId} joined their personal room`);
  });
  
  // Join arch room
  socket.on('join-arch', (archId) => {
    socket.join(`arch-${archId}`);
    console.log(`User joined arch room: ${archId}`);
  });
  
  // Leave arch room
  socket.on('leave-arch', (archId) => {
    socket.leave(`arch-${archId}`);
    console.log(`User left arch room: ${archId}`);
  });
  
  // Handle typing indicators for questions/responses
  socket.on('typing-response', (data) => {
    socket.to(`arch-${data.archId}`).emit('user-typing-response', {
      questionId: data.questionId,
      userId: data.userId,
      userName: data.userName
    });
  });
  
  socket.on('stop-typing-response', (data) => {
    socket.to(`arch-${data.archId}`).emit('user-stopped-typing-response', {
      questionId: data.questionId,
      userId: data.userId
    });
  });
  
  // Handle real-time question status updates
  socket.on('question-viewed', (data) => {
    socket.to(`arch-${data.archId}`).emit('question-view-update', {
      questionId: data.questionId,
      userId: data.userId,
      viewedAt: new Date()
    });
  });
  
  // Handle typing indicators for posts/comments
  socket.on('typing-comment', (data) => {
    socket.to(`arch-${data.archId}`).emit('user-typing-comment', {
      postId: data.postId,
      userId: data.userId,
      userName: data.userName
    });
  });
  
  socket.on('stop-typing-comment', (data) => {
    socket.to(`arch-${data.archId}`).emit('user-stopped-typing-comment', {
      postId: data.postId,
      userId: data.userId
    });
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
  res.json({ 
    status: 'OK', 
    message: 'The Arch API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Manual trigger endpoints for development/testing
if (process.env.NODE_ENV === 'development') {
  app.post('/api/admin/send-questions', async (req, res) => {
    try {
      console.log('🧪 Manual trigger: Sending daily questions...');
      const result = await dailyQuestionService.sendDailyQuestions(io);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/admin/process-responses', async (req, res) => {
    try {
      console.log('🧪 Manual trigger: Processing daily responses...');
      const result = await dailyQuestionService.processDailyResponses(io);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
  
  app.post('/api/admin/send-reminders', async (req, res) => {
    try {
      console.log('🧪 Manual trigger: Sending question reminders...');
      const result = await dailyQuestionService.sendQuestionReminders(io);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

// Daily question cron jobs
// Send questions at 6 AM ET (configurable per arch)
cron.schedule('0 6 * * *', async () => {
  console.log('Cron: Sending daily questions...');
  try {
    const result = await dailyQuestionService.sendDailyQuestions(io);
    console.log('Cron result:', result);
  } catch (error) {
    console.error('Cron error sending questions:', error);
  }
}, {
  timezone: "America/New_York"
});

// Process responses at 5 PM ET (configurable per arch)
cron.schedule('0 17 * * *', async () => {
  console.log('Cron: Processing daily responses...');
  try {
    const result = await dailyQuestionService.processDailyResponses(io);
    console.log('Cron result:', result);
  } catch (error) {
    console.error('Cron error processing responses:', error);
  }
}, {
  timezone: "America/New_York"
});

// Send reminder notifications at 3 PM for unanswered questions
cron.schedule('0 15 * * *', async () => {
  console.log('Cron: Sending question reminders...');
  try {
    const result = await dailyQuestionService.sendQuestionReminders(io);
    console.log('Cron reminder result:', result);
  } catch (error) {
    console.error('Cron error sending reminders:', error);
  }
}, {
  timezone: "America/New_York"
});

// Optional: Weekly cleanup of old processed questions (Sunday at midnight)
cron.schedule('0 0 * * 0', async () => {
  console.log('Cron: Weekly cleanup of old questions...');
  try {
    const DailyQuestion = require('./models/DailyQuestion');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const result = await DailyQuestion.deleteMany({
      processed: true,
      date: { $lt: thirtyDaysAgo }
    });
    
    console.log(`Cleaned up ${result.deletedCount} old questions`);
  } catch (error) {
    console.error('Cron error during cleanup:', error);
  }
}, {
  timezone: "America/New_York"
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/the-arch', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
  console.log('Database:', process.env.MONGODB_URI ? 'Remote' : 'Local');
})
.catch(err => console.error('MongoDB connection error:', err));

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`The Arch API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🌅 Daily questions scheduled for 6:00 AM ET');
  console.log('⏰ Question reminders scheduled for 3:00 PM ET');
  console.log('📝 Response processing scheduled for 5:00 PM ET');
  console.log('🧹 Weekly cleanup scheduled for Sunday midnight');
});