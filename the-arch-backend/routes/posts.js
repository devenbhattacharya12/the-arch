// routes/posts.js - Family Feed API Routes
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Post = require('../models/Post');
const Arch = require('../models/Arch');
const User = require('../models/User');
const DailyQuestion = require('../models/DailyQuestion');
const auth = require('../middleware/auth');

const router = express.Router();
const { sendSimpleNotification, sendToArchMembers } = require('../services/simpleNotifications');
 
// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get feed for a specific arch
router.get('/feed/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const skip = (page - 1) * limit;
    
    // Get posts for this arch
    const posts = await Post.find({ 
      arch: archId, 
      isActive: true 
    })
      .populate('author', 'name email avatar')
    .populate('likes.user', 'name email avatar')
    .populate('comments.user', 'name email avatar')
    .populate('metadata.responseAuthor', 'name email avatar') // For shared responses
    .populate('metadata.aboutUser', 'name email avatar') // For shared responses
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));
    
    
    // Get shared daily question responses for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const sharedResponses = await DailyQuestion.find({
      arch: archId,
      processed: true,
      date: { $gte: today, $lt: tomorrow },
      'responses.sharedWithArch': true
    })
    .populate('asker', 'name email avatar')
    .populate('aboutUser', 'name email avatar')
    .populate('responses.user', 'name email avatar');
    
    // Transform shared responses into feed items
    const responseItems = [];
    sharedResponses.forEach(question => {
      question.responses
        .filter(response => response.sharedWithArch && !response.passed)
        .forEach(response => {
          responseItems.push({
            _id: `response_${question._id}_${response._id}`,
            type: 'daily_response',
            question: question.question,
            response: response.response,
            aboutUser: question.aboutUser,
            author: response.user,
            createdAt: response.submittedAt,
            likes: [],
            comments: []
          });
        });
    });
    
    // Combine posts and response items, sort by date
    const feedItems = [
      ...posts.map(post => ({ 
        ...post.toObject(), 
        type: 'post',
        userHasLiked: post.likes.some(like => like.user.equals(req.userId)),
        engagementScore: post.likes.length + post.comments.length
      })), 
      ...responseItems
    ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, parseInt(limit));
    
    console.log(`📰 Retrieved ${feedItems.length} feed items for arch ${archId}`);
    
    res.json({
      feedItems,
      hasMore: posts.length === parseInt(limit),
      currentPage: parseInt(page)
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ message: error.message });
  }
});

// Create a new post
router.post('/', auth, upload.array('images', 5), async (req, res) => {
  try {
    const { archId, content } = req.body;
    const userId = req.userId;

    // Verify user is member of the arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }

    const isMember = arch.members.some(member => member.user.equals(userId));
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this arch' });
    }

    // Upload images to Cloudinary if any
    const mediaItems = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                resource_type: 'image',
                folder: 'the-arch/posts',
                transformation: [
                  { width: 1200, height: 1200, crop: 'limit' },
                  { quality: 'auto:good' }
                ]
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(file.buffer);
          });

          // Generate thumbnail
          const thumbnailUrl = cloudinary.url(result.public_id, {
            width: 300,
            height: 300,
            crop: 'fill',
            quality: 'auto:low'
          });

          mediaItems.push({
            type: 'image',
            url: result.secure_url,
            thumbnail: thumbnailUrl
          });
        } catch (uploadError) {
          console.error('Error uploading image:', uploadError);
          // Continue with other images if one fails
        }
      }
    }

    // Create the post
    const post = new Post({
      arch: archId,
      author: userId,
      content,
      media: mediaItems
    });

    await post.save();
    await post.populate('author', 'name email avatar');

    // Send real-time notification to arch members
    const io = req.app.get('io');
    if (io) {
      io.to(archId).emit('new-post', {
        post: post,
        archId: archId
      });
    }

    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get posts for an arch
router.get('/arch/:archId', auth, async (req, res) => {
  try {
    const { archId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Verify user is member of the arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }

    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this arch' });
    }

    const posts = await Post.find({ 
      arch: archId, 
      isActive: true 
    })
    .populate('author', 'name email avatar')
    .populate('likes.user', 'name')
    .populate('comments.user', 'name avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    res.json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ message: error.message });
  }
});

// Like/unlike a post
router.post('/:postId/like', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Check if user already liked the post
    const existingLike = post.likes.find(like => like.user.equals(userId));

    if (existingLike) {
      // Unlike the post
      post.likes = post.likes.filter(like => !like.user.equals(userId));
    } else {
      // Like the post
      post.likes.push({ user: userId });
    }

    await post.save();
    await post.populate('likes.user', 'name');

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(post.arch.toString()).emit('post-liked', {
        postId: postId,
        likes: post.likes,
        likedBy: userId
      });
    }

    res.json({ likes: post.likes });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add comment to post
router.post('/:postId/comment', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.userId;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Comment content is required' });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    post.comments.push({
      user: userId,
      content: content.trim()
    });

    await post.save();
    await post.populate('comments.user', 'name avatar');

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(post.arch.toString()).emit('new-comment', {
        postId: postId,
        comment: post.comments[post.comments.length - 1]
      });
    }

    res.json({ comments: post.comments });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a post (author only)
router.delete('/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.userId;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    // Only author can delete
    if (!post.author.equals(userId)) {
      return res.status(403).json({ message: 'Not authorized to delete this post' });
    }

    // Soft delete
    post.isActive = false;
    await post.save();

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(post.arch.toString()).emit('post-deleted', {
        postId: postId
      });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get post details with all comments and likes
router.get('/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId)
      .populate('author', 'name email avatar')
      .populate('likes.user', 'name email avatar')
      .populate('comments.user', 'name email avatar');
    
    if (!post || !post.isActive) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Verify user is member of the arch
    const arch = await Arch.findById(post.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    res.json(post);
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Share a daily question response to the arch feed
router.post('/share-response/:responseId', auth, async (req, res) => {
  try {
    const { responseId } = req.params;
    
    // Find the daily question with this response
    const question = await DailyQuestion.findOne({
      'responses._id': responseId
    });
    
    if (!question) {
      return res.status(404).json({ message: 'Response not found' });
    }
    
    const response = question.responses.id(responseId);
    if (!response) {
      return res.status(404).json({ message: 'Response not found' });
    }
    
    // Check if user owns this response
    if (!response.user.equals(req.userId)) {
      return res.status(403).json({ message: 'You can only share your own responses' });
    }
    
    // Mark response as shared with arch
    response.sharedWithArch = true;
    await question.save();
    
    console.log(`📢 User ${req.userId} shared response ${responseId} with arch`);
    
    res.json({ message: 'Response shared with arch successfully' });
  } catch (error) {
    console.error('Error sharing response:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;