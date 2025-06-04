// routes/posts.js - Family Feed API Routes
const express = require('express');
const Post = require('../models/Post');
const Arch = require('../models/Arch');
const User = require('../models/User');
const DailyQuestion = require('../models/DailyQuestion');
const auth = require('../middleware/auth');

const router = express.Router();
const { sendSimpleNotification, sendToArchMembers } = require('../services/simpleNotifications');

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
router.post('/', auth, async (req, res) => {
  try {
    const { archId, content, media = [] } = req.body;
    
    if (!archId || !content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Arch ID and content are required' });
    }
    
    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      return res.status(404).json({ message: 'Arch not found' });
    }
    
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const post = new Post({
      arch: archId,
      author: req.userId,
      content: content.trim(),
      media: media
    });
    
    await post.save();
    await post.populate('author', 'name email avatar');
    
    // Send push notifications to all arch members except the author
    const author = await User.findById(req.userId);
    await sendToArchMembers(
      archId,
      '📱 New family post',
      `${author.name} shared something new`,
      req.userId,
      {
        type: 'posts', // This matches user.notificationSettings.posts
        postId: post._id.toString(),
        archId: archId
      }
    );
    
    // Add real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`arch-${archId}`).emit('new-post', {
        post: post,
        authorName: author.name
      });
    }
    
    console.log(`📝 User ${req.userId} created post in arch ${archId} with notifications sent`);
    
    res.status(201).json(post);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ message: error.message });
  }
});

// Like/unlike a post
router.post('/:postId/like', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Verify user is member of the arch
    const arch = await Arch.findById(post.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    // Check if user already liked this post
    const existingLike = post.likes.find(like => like.user.equals(req.userId));
    
    if (existingLike) {
      // Unlike: remove the like
      post.likes = post.likes.filter(like => !like.user.equals(req.userId));
      await post.save();
      console.log(`👎 User ${req.userId} unliked post ${postId}`);
      res.json({ message: 'Post unliked', liked: false, likesCount: post.likes.length });
    } else {
      // Like: add the like
      post.likes.push({ user: req.userId, likedAt: new Date() });
      await post.save();
      console.log(`👍 User ${req.userId} liked post ${postId}`);
      res.json({ message: 'Post liked', liked: true, likesCount: post.likes.length });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add a comment to a post
router.post('/:postId/comment', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Comment content is required' });
    }
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Verify user is member of the arch
    const arch = await Arch.findById(post.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({ message: 'You are not a member of this arch' });
    }
    
    const comment = {
      user: req.userId,
      content: content.trim(),
      createdAt: new Date()
    };
    
    post.comments.push(comment);
    await post.save();
    
    // Populate the new comment's user info
    await post.populate('comments.user', 'name email avatar');
    
    const newComment = post.comments[post.comments.length - 1];
    
    console.log(`💬 User ${req.userId} commented on post ${postId}`);
    
    res.status(201).json({
      message: 'Comment added successfully',
      comment: newComment,
      commentsCount: post.comments.length
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete a post (only by author or arch admin)
router.delete('/:postId', auth, async (req, res) => {
  try {
    const { postId } = req.params;
    
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    // Check if user is the author
    const isAuthor = post.author.equals(req.userId);
    
    // Check if user is arch admin
    const arch = await Arch.findById(post.arch);
    const userMember = arch.members.find(member => member.user.equals(req.userId));
    const isAdmin = userMember && userMember.role === 'admin';
    
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ message: 'You can only delete your own posts or admin can delete any post' });
    }
    
    // Soft delete
    post.isActive = false;
    await post.save();
    
    console.log(`🗑️ Post ${postId} deleted by user ${req.userId}`);
    
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