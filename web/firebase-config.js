const firebaseConfig = {
    apiKey: "AIzaSyAAELQCF98_q6m9oOD0Po89kqt9eWyfJcI",
    authDomain: "pinball-leaderboard-63777.firebaseapp.com",
    databaseURL: "https://pinball-leaderboard-63777-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pinball-leaderboard-63777",
    storageBucket: "pinball-leaderboard-63777.firebasestorage.app",
    messagingSenderId: "823905026435",
    appId: "1:823905026435:web:928f86d4d104408a7ef6b6"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();
