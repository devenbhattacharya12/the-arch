// components/PostComposer.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import ImagePicker from './ImagePicker';
import { ApiService } from '../app/_layout';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Add this near the top of the file, after imports
const API_BASE_URL = 'http://192.168.1.69:3000/api';

interface ImageData {
  uri: string;
  type: string;
  name: string;
  size?: number;
}

interface PostComposerProps {
  archId: string;
  onPostCreated: (post: any) => void;
  onCancel: () => void;
}

const PostComposer: React.FC<PostComposerProps> = ({ archId, onPostCreated, onCancel }) => {
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState<ImageData[]>([]);
  const [isPosting, setIsPosting] = useState(false);

  const handlePost = async () => {
     console.log('🚀 Starting handlePost...');
  console.log('📝 Content:', content.trim());
  console.log('🖼️ Selected images:', selectedImages.length);
  console.log('🏠 Arch ID:', archId);

    if (!content.trim() && selectedImages.length === 0) {
      Alert.alert('Error', 'Please add some content or photos to your post');
      return;
    }

    setIsPosting(true);

    try {
    if (selectedImages.length === 0) {
      console.log('📝 Creating text-only post...');
      // Text-only post using existing API
      const newPost = await ApiService.createPost(archId, content.trim());
      console.log('✅ Text post created:', newPost);
      onPostCreated(newPost);
      setContent('');
      setSelectedImages([]);
    } else {
      console.log('🖼️ Creating post with images...');
      // Image post - use FormData for file upload
      const formData = new FormData();
      formData.append('archId', archId);
      formData.append('content', content.trim());

      // Add images to form data
      selectedImages.forEach((image, index) => {
        console.log(`📎 Adding image ${index}:`, image.name);
        formData.append('images', {
          uri: image.uri,
          type: image.type,
          name: image.name
        } as any);
      });

      // Get the token and make the request manually
     const token = await AsyncStorage.getItem('token');
  console.log('🔑 Got token from storage, making request...');
  
  const response = await fetch(`${API_BASE_URL}/posts`, {
    method: 'POST',
    body: formData,
    headers: {
      // Don't set Content-Type - let the browser set it for FormData
      'Authorization': `Bearer ${token}`
    }
  });

      console.log('📡 Response status:', response.status);
      
      if (response.ok) {
    const newPost = await response.json();
    console.log('✅ Image post created:', newPost);
    onPostCreated(newPost);
    setContent('');
    setSelectedImages([]);
  } else {
    const errorText = await response.text();
    console.log('❌ Error response:', errorText);
    Alert.alert('Error', 'Failed to create post with images');
  }
}
  } catch (error) {
    console.error('💥 Error creating post:', error);
    Alert.alert('Error', 'Failed to create post. Please try again.');
  } finally {
    console.log('🏁 Finished handlePost');
    setIsPosting(false);
  }
};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancelButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.title}>New Post</Text>
        <TouchableOpacity
          onPress={handlePost}
          disabled={isPosting || (!content.trim() && selectedImages.length === 0)}
          style={[
            styles.postButton,
            (!content.trim() && selectedImages.length === 0) && styles.disabledButton
          ]}
        >
          {isPosting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.postButtonText}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <TextInput
        style={styles.textInput}
        placeholder="What's happening in your family?"
        multiline
        value={content}
        onChangeText={setContent}
        maxLength={500}
      />

      <ImagePicker
        onImagesSelected={setSelectedImages}
        maxImages={5}
      />

      <Text style={styles.characterCount}>
        {content.length}/500
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  cancelButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  postButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  postButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  textInput: {
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 8,
  },
  characterCount: {
    textAlign: 'right',
    color: '#666',
    fontSize: 12,
    marginTop: 10,
  },
});

export default PostComposer;