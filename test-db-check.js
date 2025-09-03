// Test database structure to check if columns exist
import ObitoX from './dist/index.esm.js';

async function checkDatabaseStructure() {
  console.log('🔍 Checking Database Structure...\n');
  
  try {
    const obitox = new ObitoX({
      apiKey: 'ox_0516ef51ef63677a449cebcf099de3f9f0b36ddb1e5af0fd6a830772c1fe5544',
      baseUrl: 'http://localhost:5500'
    });
    
    console.log('1️⃣ Testing API key validation...');
    const validation = await obitox.validate();
    
    console.log('📊 Current API Response:');
    console.log(JSON.stringify(validation, null, 2));
    
    console.log('\n2️⃣ Checking for new tracking fields...');
    
    if (validation.data?.api_key?.total_file_size !== undefined) {
      console.log('✅ total_file_size field exists!');
    } else {
      console.log('❌ total_file_size field missing');
    }
    
    if (validation.data?.api_key?.total_files_uploaded !== undefined) {
      console.log('✅ total_files_uploaded field exists!');
    } else {
      console.log('❌ total_files_uploaded field missing');
    }
    
    if (validation.data?.api_key?.file_type_counts !== undefined) {
      console.log('✅ file_type_counts field exists!');
    } else {
      console.log('❌ file_type_counts field missing');
    }
    
    if (validation.data?.api_key?.total_file_size_formatted !== undefined) {
      console.log('✅ total_file_size_formatted field exists!');
    } else {
      console.log('❌ total_file_size_formatted field missing');
    }
    
    console.log('\n🎯 Database Structure Check Complete!');
    
  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

checkDatabaseStructure();
