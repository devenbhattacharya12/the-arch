const express = require('express');
const GetTogether = require('../models/GetTogether');
const Arch = require('../models/Arch');
const User = require('../models/User');
const auth = require('../middleware/auth');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const router = express.Router();


// Add this test route at the very beginning of your gettogethers.js file
router.post('/test', (req, res) => {
  console.log('🧪 TEST POST ROUTE HIT!');
  console.log('Body:', req.body);
  console.log('Headers:', req.headers);
  res.json({ 
    message: 'Test POST successful!', 
    timestamp: new Date().toISOString(),
    receivedBody: req.body 
  });
});


// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// IMPORTANT: Routes are ordered from most specific to least specific
// This prevents route conflicts where Express matches the wrong route

// ==================== SPECIFIC ROUTES FIRST ====================

// Create a new get-together
router.post('/', auth, upload.single('image'), async (req, res) => {
  console.log('🎯 Get-together CREATE route hit!');
  console.log('📝 Request body:', req.body);
  console.log('📸 Has file:', !!req.file);
  console.log('👤 User ID:', req.userId);
  
  try {
    const { archId, title, description, type, scheduledFor, location, virtualLink } = req.body;
    
    if (!archId || !title || !type || !scheduledFor) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        message: 'Arch ID, title, type, and scheduled date/time are required' 
      });
    }

    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      console.log('❌ Arch not found:', archId);
      return res.status(404).json({ message: 'Arch not found' });
    }

    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      console.log('❌ User not member of arch');
      return res.status(403).json({ message: 'Not a member of this arch' });
    }

    // Handle image upload if present
    let imageUrl = null;
    if (req.file) {
      console.log('📸 Processing image upload...');
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              transformation: [
                { width: 800, height: 600, crop: 'limit' },
                { quality: 'auto', fetch_format: 'auto' }
              ],
              folder: 'arch-gettogethers'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file.buffer);
        });
        imageUrl = result.secure_url;
        console.log('✅ Image uploaded successfully');
      } catch (uploadError) {
        console.error('❌ Image upload failed:', uploadError);
        // Continue without image rather than failing
      }
    }

    // Create the get-together
    const getTogether = new GetTogether({
      arch: archId,
      creator: req.userId,
      title,
      description,
      type,
      scheduledFor: new Date(scheduledFor),
      location: type === 'in-person' ? location : null,
      virtualLink: type === 'virtual' ? virtualLink : null,
      image: imageUrl,
      invitees: arch.members.map(member => ({
        user: member.user,
        status: member.user.equals(req.userId) ? 'accepted' : 'pending'
      }))
    });

    await getTogether.save();
    console.log('✅ Get-together saved to database');

    // Populate the data for response
    await getTogether.populate([
      { path: 'creator', select: 'name avatar' },
      { path: 'arch', select: 'name' },
      { path: 'invitees.user', select: 'name avatar' }
    ]);

    // Send real-time notifications to arch members
    const io = req.app.get('io');
    if (io) {
      io.to(archId).emit('new-gettogether', {
        getTogether,
        message: `${getTogether.creator.name} created a new event: ${title}`
      });
    }

    console.log('✅ Get-together created successfully');
    res.status(201).json(getTogether);
  } catch (error) {
    console.error('❌ Error creating get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get get-togethers for an arch (with optional date filtering)
router.get('/arch/:archId', auth, async (req, res) => {
  console.log('🔍 Getting get-togethers for arch:', req.params.archId);
  console.log('👤 User ID:', req.userId);
  
  try {
    const { archId } = req.params;
    const { month, year, startDate, endDate } = req.query;

    // Verify user is member of this arch
    const arch = await Arch.findById(archId);
    if (!arch) {
      console.log('❌ Arch not found:', archId);
      return res.status(404).json({ message: 'Arch not found' });
    }

    const isMember = arch.members.some(member => member.user.equals(req.userId));
    if (!isMember) {
      console.log('❌ User not member of arch');
      return res.status(403).json({ message: 'Not a member of this arch' });
    }

    // Build date filter
    let dateFilter = {};
    if (month && year) {
      // Get events for specific month/year
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      dateFilter = {
        scheduledFor: {
          $gte: startOfMonth,
          $lte: endOfMonth
        }
      };
      console.log('📅 Date filter applied:', dateFilter);
    } else if (startDate && endDate) {
      // Get events for date range
      dateFilter = {
        scheduledFor: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      };
      console.log('📅 Date range filter applied:', dateFilter);
    }

    const getTogethers = await GetTogether.find({
      arch: archId,
      ...dateFilter
    })
    .populate('creator', 'name avatar')
    .populate('arch', 'name')
    .populate('invitees.user', 'name avatar')
    .sort({ scheduledFor: 1 });

    console.log(`✅ Found ${getTogethers.length} get-togethers`);
    res.json(getTogethers);
  } catch (error) {
    console.error('❌ Error getting get-togethers:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== SPECIFIC ACTION ROUTES ====================

// RSVP to a get-together - MUST come before general /:getTogetherId route
router.post('/:getTogetherId/rsvp', auth, async (req, res) => {
  console.log('📝 RSVP route hit!');
  console.log('🎯 Get-together ID:', req.params.getTogetherId);
  console.log('📋 RSVP Status:', req.body.status);
  console.log('👤 User ID:', req.userId);
  
  try {
    const { getTogetherId } = req.params;
    const { status } = req.body; // 'accepted', 'declined', 'pending'

    if (!['accepted', 'declined', 'pending'].includes(status)) {
      console.log('❌ Invalid RSVP status:', status);
      return res.status(400).json({ message: 'Invalid RSVP status' });
    }

    const getTogether = await GetTogether.findById(getTogetherId);
    if (!getTogether) {
      console.log('❌ Get-together not found:', getTogetherId);
      return res.status(404).json({ message: 'Get-together not found' });
    }

    // Find user's invitee record
    const invitee = getTogether.invitees.find(inv => inv.user.equals(req.userId));
    if (!invitee) {
      console.log('❌ User not invited to event');
      return res.status(403).json({ message: 'You are not invited to this event' });
    }

    console.log('✅ Found invitee record, updating RSVP...');

    // Update RSVP status
    invitee.status = status;
    invitee.respondedAt = new Date();

    await getTogether.save();
    console.log('✅ RSVP updated in database');

    // Populate for response
    await getTogether.populate([
      { path: 'creator', select: 'name avatar' },
      { path: 'invitees.user', select: 'name avatar' }
    ]);

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(getTogether.arch.toString()).emit('gettogether-rsvp', {
        getTogetherId,
        userId: req.userId,
        status,
        user: invitee.user
      });
    }

    console.log('✅ RSVP updated successfully');
    res.json({
      message: 'RSVP updated successfully',
      getTogether
    });
  } catch (error) {
    console.error('❌ Error updating RSVP:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add timeline entry (note/photo/video during event)
router.post('/:getTogetherId/timeline', auth, upload.array('media', 5), async (req, res) => {
  console.log('📝 Timeline entry route hit!');
  console.log('🎯 Get-together ID:', req.params.getTogetherId);
  console.log('👤 User ID:', req.userId);
  
  try {
    const { getTogetherId } = req.params;
    const { type, content } = req.body; // type: 'note', 'photo', 'video'

    const getTogether = await GetTogether.findById(getTogetherId);
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }

    // Verify user is member of this arch
    const arch = await Arch.findById(getTogether.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Handle media uploads if present
    let mediaUrls = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Processing ${req.files.length} media files...`);
      for (const file of req.files) {
        try {
          const result = await new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              {
                resource_type: 'auto',
                transformation: [
                  { width: 1200, height: 1200, crop: 'limit' },
                  { quality: 'auto', fetch_format: 'auto' }
                ],
                folder: 'arch-timeline'
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            ).end(file.buffer);
          });
          
          mediaUrls.push({
            url: result.secure_url,
            thumbnail: result.secure_url // Cloudinary can generate thumbnails
          });
        } catch (uploadError) {
          console.error('Media upload failed:', uploadError);
        }
      }
    }

    // Add timeline entry
    const timelineEntry = {
      user: req.userId,
      type,
      content,
      media: mediaUrls,
      timestamp: new Date()
    };

    getTogether.timeline.push(timelineEntry);
    await getTogether.save();

    // Populate for response
    await getTogether.populate('timeline.user', 'name avatar');

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(getTogether.arch.toString()).emit('gettogether-timeline', {
        getTogetherId,
        timelineEntry: getTogether.timeline[getTogether.timeline.length - 1]
      });
    }

    console.log('✅ Timeline entry added successfully');
    res.status(201).json({
      message: 'Timeline entry added successfully',
      timelineEntry: getTogether.timeline[getTogether.timeline.length - 1]
    });
  } catch (error) {
    console.error('❌ Error adding timeline entry:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get RSVP summary for a get-together - MUST come before general /:getTogetherId route
router.get('/:getTogetherId/rsvp-summary', auth, async (req, res) => {
  console.log('📊 RSVP summary route hit!');
  console.log('🎯 Get-together ID:', req.params.getTogetherId);
  
  try {
    const getTogether = await GetTogether.findById(req.params.getTogetherId)
      .populate('invitees.user', 'name avatar');

    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }

    // Verify access
    const arch = await Arch.findById(getTogether.arch);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Group RSVPs by status
    const rsvpSummary = {
      accepted: getTogether.invitees.filter(inv => inv.status === 'accepted'),
      declined: getTogether.invitees.filter(inv => inv.status === 'declined'),
      pending: getTogether.invitees.filter(inv => inv.status === 'pending'),
      total: getTogether.invitees.length
    };

    console.log('✅ RSVP summary generated');
    res.json(rsvpSummary);
  } catch (error) {
    console.error('❌ Error getting RSVP summary:', error);
    res.status(500).json({ message: error.message });
  }
});

// ==================== GENERAL ROUTES LAST ====================

// Update get-together (creator only)
router.put('/:getTogetherId', auth, upload.single('image'), async (req, res) => {
  console.log('✏️ Update get-together route hit!');
  console.log('🎯 Get-together ID:', req.params.getTogetherId);
  console.log('👤 User ID:', req.userId);
  
  try {
    const getTogether = await GetTogether.findById(req.params.getTogetherId);
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }

    // Only creator can update
    if (!getTogether.creator.equals(req.userId)) {
      return res.status(403).json({ message: 'Only the creator can update this event' });
    }

    const { title, description, type, scheduledFor, location, virtualLink, status } = req.body;

    // Handle image upload if present
    if (req.file) {
      console.log('📸 Processing image update...');
      try {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              resource_type: 'image',
              transformation: [
                { width: 800, height: 600, crop: 'limit' },
                { quality: 'auto', fetch_format: 'auto' }
              ],
              folder: 'arch-gettogethers'
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(req.file.buffer);
        });
        getTogether.image = result.secure_url;
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError);
      }
    }

    // Update fields
    if (title !== undefined) getTogether.title = title;
    if (description !== undefined) getTogether.description = description;
    if (type !== undefined) getTogether.type = type;
    if (scheduledFor !== undefined) getTogether.scheduledFor = new Date(scheduledFor);
    if (location !== undefined) getTogether.location = location;
    if (virtualLink !== undefined) getTogether.virtualLink = virtualLink;
    if (status !== undefined) getTogether.status = status;

    await getTogether.save();

    // Populate for response
    await getTogether.populate([
      { path: 'creator', select: 'name avatar' },
      { path: 'arch', select: 'name' },
      { path: 'invitees.user', select: 'name avatar' }
    ]);

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(getTogether.arch._id.toString()).emit('gettogether-updated', {
        getTogether
      });
    }

    console.log('✅ Get-together updated successfully');
    res.json(getTogether);
  } catch (error) {
    console.error('❌ Error updating get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// Delete get-together (creator only)
router.delete('/:getTogetherId', auth, async (req, res) => {
  console.log('🗑️ Delete get-together route hit!');
  console.log('🎯 Get-together ID:', req.params.getTogetherId);
  console.log('👤 User ID:', req.userId);
  
  try {
    const getTogether = await GetTogether.findById(req.params.getTogetherId);
    if (!getTogether) {
      return res.status(404).json({ message: 'Get-together not found' });
    }

    // Only creator can delete
    if (!getTogether.creator.equals(req.userId)) {
      return res.status(403).json({ message: 'Only the creator can delete this event' });
    }

    await GetTogether.findByIdAndDelete(req.params.getTogetherId);

    // Send real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(getTogether.arch.toString()).emit('gettogether-deleted', {
        getTogetherId: req.params.getTogetherId
      });
    }

    console.log('✅ Get-together deleted successfully');
    res.json({ message: 'Get-together deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get a specific get-together by ID - MUST BE LAST!
// This is the most general route and will match any /:getTogetherId pattern
router.get('/:getTogetherId', auth, async (req, res) => {
  console.log('🔍 Get specific get-together route hit!');
  console.log('🎯 Get-together ID:', req.params.getTogetherId);
  console.log('👤 User ID:', req.userId);
  
  try {
    const getTogether = await GetTogether.findById(req.params.getTogetherId)
      .populate('creator', 'name avatar')
      .populate('arch', 'name')
      .populate('invitees.user', 'name avatar')
      .populate('timeline.user', 'name avatar');

    if (!getTogether) {
      console.log('❌ Get-together not found:', req.params.getTogetherId);
      return res.status(404).json({ message: 'Get-together not found' });
    }

    // Verify user is member of this arch
    const arch = await Arch.findById(getTogether.arch._id);
    const isMember = arch.members.some(member => member.user.equals(req.userId));
    
    if (!isMember) {
      console.log('❌ User not member of arch');
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log('✅ Get-together retrieved successfully');
    res.json(getTogether);
  } catch (error) {
    console.error('❌ Error getting get-together:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;