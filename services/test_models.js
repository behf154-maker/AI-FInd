/**
 * Test script to find working HuggingFace models
 * Run: node services/test_models.js
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const API_KEY = process.env.HUGGINGFACE_API_KEY;
const BASE_URL = 'https://api-inference.huggingface.co/models';

// List of FREE models to test
const modelsToTest = [
  'microsoft/resnet-50',
  'microsoft/resnet-18',
  'google/mobilenet_v2_1.0_224',
  'facebook/convnext-tiny-224',
  'timm/resnet50.a1_in1k',
  'google/vit-base-patch16-224',
  'apple/mobilevit-small',
];

async function testModel(modelName) {
  try {
    console.log(`\n🧪 Testing: ${modelName}`);
    
    // Create a simple test image (1x1 pixel)
    const testImage = Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A',
      'base64'
    );
    
    const headers = {
      'Content-Type': 'image/jpeg',
    };
    
    if (API_KEY) {
      headers['Authorization'] = `Bearer ${API_KEY}`;
    }
    
    const response = await axios.post(
      `${BASE_URL}/${modelName}`,
      testImage,
      {
        headers: headers,
        timeout: 30000,
      }
    );
    
    if (response.data?.error) {
      if (response.data.error.includes('loading')) {
        console.log(`   ⏳ Model is loading (will work after a few seconds)`);
        return { model: modelName, status: 'loading', working: true };
      } else {
        console.log(`   ❌ Error: ${response.data.error}`);
        return { model: modelName, status: 'error', working: false };
      }
    }
    
    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log(`   ✅ WORKING! Got ${response.data.length} predictions`);
      return { model: modelName, status: 'working', working: true };
    }
    
    console.log(`   ⚠️  Unexpected response format`);
    return { model: modelName, status: 'unknown', working: false };
    
  } catch (error) {
    if (error.response?.status === 503) {
      console.log(`   ⏳ Model is loading (503)`);
      return { model: modelName, status: 'loading', working: true };
    } else if (error.response?.status === 404) {
      console.log(`   ❌ Model not found (404)`);
      return { model: modelName, status: 'not_found', working: false };
    } else {
      console.log(`   ❌ Error: ${error.message}`);
      return { model: modelName, status: 'error', working: false };
    }
  }
}

async function main() {
  console.log('🔍 Testing HuggingFace Models...');
  console.log(`   API Key: ${API_KEY ? '✅ Present' : '❌ Not found (using free tier)'}`);
  console.log(`   Base URL: ${BASE_URL}\n`);
  
  const results = [];
  
  for (const model of modelsToTest) {
    const result = await testModel(model);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s between tests
  }
  
  console.log('\n\n📊 RESULTS:');
  console.log('='.repeat(50));
  
  const working = results.filter(r => r.working);
  const notWorking = results.filter(r => !r.working);
  
  if (working.length > 0) {
    console.log('\n✅ WORKING MODELS:');
    working.forEach(r => {
      console.log(`   - ${r.model} (${r.status})`);
    });
  }
  
  if (notWorking.length > 0) {
    console.log('\n❌ NOT WORKING:');
    notWorking.forEach(r => {
      console.log(`   - ${r.model} (${r.status})`);
    });
  }
  
  console.log(`\n✅ Found ${working.length}/${results.length} working models`);
}

main().catch(console.error);

