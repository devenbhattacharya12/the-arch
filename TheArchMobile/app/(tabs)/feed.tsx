// app/(tabs)/feed.tsx - Family Feed Screen
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ApiService, useAuth } from '../_layout';

interface FeedItem {
  _id: string;
  type: 'post' | 'daily_response';
  content?: string;
  question?: string;
  response?: string;
  aboutUser?: {
    _id: string;
    name: string;
  };
  author: {
    _id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  createdAt: string;
  likes: Array<{
    user: {
      _id: string;
      name: string;
    };
    likedAt: string;
  }>;
  comments: Array<{
    _id: string;
    user: {
      _id: string;
      name: string;
    };
    content: string;
    createdAt: string;
  }>;
  media?: Array<{
    type: string;
    url: string;
    thumbnail?: string;
  }>;
}

interface Arch {
  _id: string;
  name: string;
}

export default function FeedScreen() {
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [arches, setArches] = useState<Arch[]>([]);
  const [selectedArch, setSelectedArch] = useState<Arch | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [submittingPost, setSubmittingPost] = useState(false);
  const [commentInputs, setCommentInputs] = useState<{ [key: string]: string }>({});
  const [showComments, setShowComments] = useState<{ [key: string]: boolean }>({});

  const { user } = useAuth();

  useEffect(() => {
    loadArches();
  }, []);

  useEffect(() => {
    if (selectedArch) {
      loadFeed();
    }
  }, [selectedArch]);

  const loadArches = async () => {
    try {
      const archesData = await ApiService.getArches();
      setArches(archesData);
      if (archesData.length > 0 && !selectedArch) {
        setSelectedArch(archesData[0]);
      }
    } catch (error: any) {
      Alert.alert('Error', 'Failed to load arches: ' + error.message);
    }
  };

  const loadFeed = async () => {
    if (!selectedArch) return;
    
    try {
      console.log('📰 Loading feed for arch:', selectedArch.name);
      const feedData = await ApiService.getArchFeed(selectedArch._id);
      setFeedItems(feedData.feedItems || []);
    } catch (error: any) {
      console.error('❌ Error loading feed:', error);
      Alert.alert('Error', 'Failed to load feed: ' + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadFeed();
  };

  const createPost = async () => {
    if (!newPostContent.trim() || !selectedArch) return;
    
    setSubmittingPost(true);
    try {
      await ApiService.createPost(selectedArch._id, newPostContent.trim());
      setNewPostContent('');
      setShowCreatePost(false);
      await loadFeed();
      Alert.alert('Success', 'Your post has been shared with the family!');
    } catch (error: any) {
      Alert.alert('Error', 'Failed to create post: ' + error.message);
    } finally {
      setSubmittingPost(false);
    }
  };

  const toggleLike = async (postId: string) => {
    try {
      await ApiService.togglePostLike(postId);
      await loadFeed(); // Refresh to show updated likes
    } catch (error: any) {
      Alert.alert('Error', 'Failed to like post: ' + error.message);
    }
  };

  const addComment = async (postId: string) => {
    const content = commentInputs[postId];
    if (!content?.trim()) return;
    
    try {
      await ApiService.addPostComment(postId, content.trim());
      setCommentInputs(prev => ({ ...prev, [postId]: '' }));
      await loadFeed(); // Refresh to show new comment
    } catch (error: any) {
      Alert.alert('Error', 'Failed to add comment: ' + error.message);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  };

  const getUserLiked = (item: FeedItem) => {
    return item.likes.some(like => like.user._id === user?.id);
  };

  const renderFeedItem = (item: FeedItem) => {
    const userLiked = getUserLiked(item);
    const showItemComments = showComments[item._id];
    
    return (
      <View key={item._id} style={styles.feedItem}>
        {/* Header */}
        <View style={styles.itemHeader}>
          <View style={styles.authorInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {item.author.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.authorName}>{item.author.name}</Text>
              <Text style={styles.timeAgo}>{formatTimeAgo(item.createdAt)}</Text>
            </View>
          </View>
          {item.type === 'daily_response' && (
            <View style={styles.responseTag}>
              <Ionicons name="heart" size={12} color="#ff6b6b" />
              <Text style={styles.responseTagText}>Daily Response</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.itemContent}>
          {item.type === 'daily_response' ? (
            <View style={styles.responseContent}>
              <Text style={styles.questionText}>
                "{item.question?.replace('{name}', item.aboutUser?.name || '')}"
              </Text>
              <Text style={styles.responseText}>
                {item.response}
              </Text>
              <Text style={styles.aboutUserText}>
                💙 About {item.aboutUser?.name}
              </Text>
            </View>
          ) : (
            <Text style={styles.postContent}>{item.content}</Text>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, userLiked && styles.likedButton]}
            onPress={() => toggleLike(item._id)}
          >
            <Ionicons 
              name={userLiked ? "heart" : "heart-outline"} 
              size={20} 
              color={userLiked ? "#ff6b6b" : "#6c757d"} 
            />
            <Text style={[styles.actionText, userLiked && styles.likedText]}>
              {item.likes.length} {item.likes.length === 1 ? 'Like' : 'Likes'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowComments(prev => ({ 
              ...prev, 
              [item._id]: !showItemComments 
            }))}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#6c757d" />
            <Text style={styles.actionText}>
              {item.comments.length} {item.comments.length === 1 ? 'Comment' : 'Comments'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Comments Section */}
        {showItemComments && (
          <View style={styles.commentsSection}>
            {/* Existing Comments */}
            {item.comments.map((comment) => (
              <View key={comment._id} style={styles.comment}>
                <View style={styles.commentAvatar}>
                  <Text style={styles.commentAvatarText}>
                    {comment.user.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.commentContent}>
                  <Text style={styles.commentAuthor}>{comment.user.name}</Text>
                  <Text style={styles.commentText}>{comment.content}</Text>
                  <Text style={styles.commentTime}>
                    {formatTimeAgo(comment.createdAt)}
                  </Text>
                </View>
              </View>
            ))}

            {/* Add Comment */}
            <View style={styles.addComment}>
              <TextInput
                style={styles.commentInput}
                placeholder="Add a comment..."
                value={commentInputs[item._id] || ''}
                onChangeText={(text) => 
                  setCommentInputs(prev => ({ ...prev, [item._id]: text }))
                }
                multiline
              />
              <TouchableOpacity
                style={[
                  styles.commentSubmit,
                  (!commentInputs[item._id]?.trim()) && styles.commentSubmitDisabled
                ]}
                onPress={() => addComment(item._id)}
                disabled={!commentInputs[item._id]?.trim()}
              >
                <Ionicons name="send" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading family feed...</Text>
      </View>
    );
  }

  if (arches.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Family Feed</Text>
        </View>
        <View style={styles.centerContainer}>
          <Ionicons name="home-outline" size={64} color="#ccc" />
          <Text style={styles.emptyTitle}>No Arches Found</Text>
          <Text style={styles.emptySubtitle}>
            Create or join a family arch to see the feed
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Family Feed</Text>
        <TouchableOpacity
          style={styles.createPostButton}
          onPress={() => setShowCreatePost(true)}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Arch Selector */}
      {arches.length > 1 && (
        <ScrollView 
          horizontal 
          style={styles.archSelector}
          showsHorizontalScrollIndicator={false}
        >
          {arches.map((arch) => (
            <TouchableOpacity
              key={arch._id}
              style={[
                styles.archChip,
                selectedArch?._id === arch._id && styles.selectedArchChip
              ]}
              onPress={() => setSelectedArch(arch)}
            >
              <Text style={[
                styles.archChipText,
                selectedArch?._id === arch._id && styles.selectedArchChipText
              ]}>
                {arch.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Feed */}
      <ScrollView
        style={styles.feed}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {feedItems.length === 0 ? (
          <View style={styles.emptyFeed}>
            <Ionicons name="newspaper-outline" size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Posts Yet</Text>
            <Text style={styles.emptySubtitle}>
              Be the first to share something with your family!
            </Text>
          </View>
        ) : (
          feedItems.map(renderFeedItem)
        )}
      </ScrollView>

      {/* Create Post Modal */}
      <Modal
        visible={showCreatePost}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreatePost(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Share with Family</Text>
            <TouchableOpacity
              onPress={createPost}
              disabled={!newPostContent.trim() || submittingPost}
            >
              <Text style={[
                styles.modalPost,
                (!newPostContent.trim() || submittingPost) && styles.modalPostDisabled
              ]}>
                {submittingPost ? 'Posting...' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <TextInput
              style={styles.postInput}
              placeholder="What's happening with the family?"
              value={newPostContent}
              onChangeText={setNewPostContent}
              multiline
              autoFocus
            />
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  createPostButton: {
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  archSelector: {
    backgroundColor: 'white',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  archChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  selectedArchChip: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  archChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6c757d',
  },
  selectedArchChipText: {
    color: 'white',
  },
  feed: {
    flex: 1,
  },
  feedItem: {
    backgroundColor: 'white',
    marginBottom: 10,
    paddingVertical: 15,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  authorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timeAgo: {
    fontSize: 12,
    color: '#6c757d',
    marginTop: 2,
  },
  responseTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  responseTagText: {
    fontSize: 11,
    color: '#ff6b6b',
    fontWeight: '500',
  },
  itemContent: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  postContent: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
  },
  responseContent: {
    gap: 10,
  },
  questionText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#667eea',
    backgroundColor: '#f0f4ff',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#667eea',
  },
  responseText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
  },
  aboutUserText: {
    fontSize: 12,
    color: '#6c757d',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likedButton: {
    // No additional styling needed
  },
  actionText: {
    fontSize: 14,
    color: '#6c757d',
  },
  likedText: {
    color: '#ff6b6b',
  },
  commentsSection: {
    marginTop: 15,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  comment: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e9ecef',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  commentAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6c757d',
  },
  commentContent: {
    flex: 1,
  },
  commentAuthor: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  commentText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 18,
  },
  commentTime: {
    fontSize: 11,
    color: '#6c757d',
    marginTop: 2,
  },
  addComment: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e1e5e9',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    fontSize: 14,
    maxHeight: 80,
  },
  commentSubmit: {
    backgroundColor: '#667eea',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSubmitDisabled: {
    opacity: 0.5,
  },
  emptyFeed: {
    alignItems: 'center',
    padding: 40,
    marginTop: 50,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 15,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingText: {
    marginTop: 10,
    color: '#6c757d',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e5e9',
  },
  modalCancel: {
    fontSize: 16,
    color: '#6c757d',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalPost: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  modalPostDisabled: {
    opacity: 0.5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  postInput: {
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
    flex: 1,
  },
});