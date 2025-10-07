// Firebase Configuration
// IMPORTANT: Replace these values with your actual Firebase project credentials
// Get these from: Firebase Console > Project Settings > Your apps > Firebase SDK snippet

// ⚠️ SECURITY WARNING: These credentials are exposed in the client-side code.
// Make sure to configure Firebase Security Rules properly:
// - Enable authentication requirements
// - Restrict database access to authenticated users only
// - Set up proper validation rules in Firestore

const firebaseConfig = {
    apiKey: "AIzaSyBiRNc-X-d7CyzaJZ8xWzhDvjHr1DsgAwQ",
    authDomain: "taskmaster-pro-9c740.firebaseapp.com",
    projectId: "taskmaster-pro-9c740",
    storageBucket: "taskmaster-pro-9c740.firebasestorage.app",
    messagingSenderId: "712062169475",
    appId: "1:712062169475:web:e834b9287eae28a481c6b6",
    measurementId: "G-BB3PT799YY"
};

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase initialized successfully');
    } else {
        console.log('✅ Firebase already initialized');
    }
} catch (error) {
    console.error('❌ Firebase initialization error:', error);
    alert('Firebase bağlantı hatası: ' + error.message);
}

// Initialize Firestore with offline persistence
const db = firebase.firestore();

// Enable offline persistence (quiet mode)
db.enablePersistence({ synchronizeTabs: true })
    .catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Persistence failed: Multiple tabs open');
        } else if (err.code === 'unimplemented') {
            console.warn('Persistence not available in this browser');
        } else {
            console.error('Persistence error:', err);
        }
    });

// Initialize Auth
const auth = firebase.auth();

// Set auth persistence to LOCAL (stays even after browser close)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error('Auth persistence error:', error);
    });
