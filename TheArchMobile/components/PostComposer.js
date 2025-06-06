// components/PostComposer.js
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

const PostComposer = ({ archId, onPostCreated, onCancel }) => {
  const [content, setContent] = useState('');
  const [selectedImages, setSelectedImages] = useState([]);
  const [isPosting, setIsPosting] = useState(false);

  const handlePost = async () => {
    if (!content.trim() && selectedImages.length === 0) {
      Alert.alert('Error', 'Please add some content or photos to your post');
      return;
    }

    setIsPosting(true);

    try {
      const formData = new FormData();
      formData.append('archId', archId);
      formData.append('content', content.trim());

      // Add images to form data
      selectedImages.forEach((image, index) => {
        formData.append('images', {
          uri: image.uri,
          type: image.type,
          name: image.name
        } as any);
      });

      // Use ApiService to create the post
      const response = await fetch(`${ApiService.baseURL}/posts`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${await ApiService.getToken()}`
        }
      });

      if (response.ok) {
        const newPost = await response.json();
        onPostCreated(newPost);
        setContent('');
        setSelectedImages([]);
      } else {
        const error = await response.json();
        Alert.alert('Error', error.message || 'Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
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