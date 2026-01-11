// --- 1. 配置区域 (您的配置) ---
const firebaseConfig = {
    apiKey: "AIzaSyBwfDRnXxg7pouAsAdOXuNFP0BnnDWlK3I",
    authDomain: "quizapp-c204a.firebaseapp.com",
    projectId: "quizapp-c204a",
    storageBucket: "quizapp-c204a.firebasestorage.app",
    messagingSenderId: "117422520372",
    appId: "1:117422520372:web:d706372f702539f448f261",
};

// --- 2. 初始化逻辑 ---
let db;
let isAnalyticsEnabled = false;

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    isAnalyticsEnabled = true;
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// --- 3. 恢复 DOM 元素获取 (改回您原来的顶部定义方式) ---
// ⚠️ 注意：如果脚本放在 <head> 里，请确保加上 defer 属性，或者把 <script> 放到 <body> 最底部
const homeView = document.getElementById('home-view');
const quizView = document.getElementById('quiz-view');
const resultView = document.getElementById('result-view');
const container = document.getElementById('question-container');
const progressEl = document.getElementById('progress');
const scoreEl = document.getElementById('current-score');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');

// --- 4. 游戏变量 ---
let rawQuestions = [];
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let wrongAnswers = [];
let isReviewMode = false;

// --- 5. 增强追踪功能 (独立运行，不卡主程序) ---
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (e) { return "Unknown_IP"; }
}

function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad/i.test(ua)) return "iPhone/iPad";
    if (/Android/i.test(ua)) return "Android 手机";
    if (/Windows/i.test(ua)) return "Windows PC";
    if (/Mac/i.test(ua)) return "Mac 电脑";
    return "其他设备";
}

async function saveVisitRecord() {
    // Session 防刷：浏览器没关就不重复记
    if (sessionStorage.getItem('recorded_v2')) return;

    if (isAnalyticsEnabled) {
        // 异步获取，不阻塞页面加载
        getClientIP().then(ip => {
            let userId = localStorage.getItem('quiz_user_id');
            let isNewUser = false;
            if (!userId) {
                userId = 'u_' + Date.now() + '_' + Math.random().toString(36).substr(2);
                localStorage.setItem('quiz_user_id', userId);
                isNewUser = true;
            }
            
            db.collection('user_logs_pro').add({
                ip: ip,
                device: getDeviceName(),
                time: new Date().toLocaleString(),
                isNew: isNewUser,
                uid: userId,
                ua: navigator.userAgent
            }).catch(err => console.log("Log skipped")); // 记录失败也不报错
            
            sessionStorage.setItem('recorded_v2', 'true');
        });
    }
}

// --- 6. 刷题核心逻辑 (完全恢复您的原始逻辑) ---

async function fetchQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error('Network err');
        rawQuestions = await response.json();
    } catch (error) {
        console.error("Load Error:", error);
    }
}

async function initGame(mode) {
    // 确保题目已加载
    if (rawQuestions.length === 0) {
        await fetchQuestions();
        if (rawQuestions.length === 0) return;
    }
    
    let tempQuestions = [];

    if (mode === 'review') {
        const savedMistakes = JSON.parse(localStorage.getItem('quiz_mistakes') || '[]');
        if (savedMistakes.length === 0) {
            alert("错题本是空的！");
            return;
        }
        tempQuestions = rawQuestions.filter(q => savedMistakes.includes(q.id));
        tempQuestions.sort(() => Math.random() - 0.5);
    } else {
        tempQuestions = JSON.parse(JSON.stringify(rawQuestions));
        if (mode === 'random') {
            for (let i = tempQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [tempQuestions[i], tempQuestions[j]] = [tempQuestions[j], tempQuestions[i]];
            }
        }
    }

    questions = tempQuestions.map(q => ({ ...q, userAnswer: null }));
    currentQuestionIndex = 0;
    score = 0;
    wrongAnswers = [];
    isReviewMode = (mode === 'review');
    
    // UI 重置
    scoreEl.innerText = 0;
    nextBtn.innerText = "下一题";
    
    // 页面切换
    homeView.classList.add('hidden');
    resultView.classList.add('hidden');
    quizView.classList.remove('hidden');

    renderQuestion();
}

function renderQuestion() {
    if (currentQuestionIndex >= questions.length) {
        showResult();
        return;
    }

    const q = questions[currentQuestionIndex];
    const isMulti = q.type === 'multi';
    progressEl.innerText = `${currentQuestionIndex + 1} / ${questions.length}`;

    container.innerHTML = `
        <span class="question-tag">${isMulti ? '多选题' : '单选题'}</span>
        <h3 class="question-text">${q.id}. ${q.question}</h3>
        <div class="options-list">
            ${q.options.map((opt, idx) => `
                <label class="option-item" data-idx="${idx}">
                    <div class="option-icon"></div>
                    <input type="${isMulti ? 'checkbox' : 'radio'}" name="opt" value="${idx}">
                    <span class="option-text">${String.fromCharCode(65 + idx)}. ${opt}</span>
                </label>
            `).join('')}
        </div>
    `;
    
    // 简单的淡入效果
    container.style.opacity = '0';
    setTimeout(() => container.style.opacity = '1', 10);

    submitBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    container.style.pointerEvents = 'auto';

    // 绑定点击事件
    const items = container.querySelectorAll('.option-item');
    items.forEach(item => {
        item.addEventListener('change', () => {
            if (!isMulti) items.forEach(i => i.classList.remove('selected'));
            const input = item.querySelector('input');
            input.checked ? item.classList.add('selected') : item.classList.remove('selected');
        });
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function submitAnswer() {
    const q = questions[currentQuestionIndex];
    const inputs = container.querySelectorAll('input:checked');
    if (inputs.length === 0) return;

    let userVals = Array.from(inputs).map(i => parseInt(i.value));
    let isCorrect = false;

    if (q.type === 'single') {
        isCorrect = userVals[0] === q.answer;
    } else {
        const correctSorted = [...q.answer].sort().toString();
        const userSorted = [...userVals].sort().toString();
        isCorrect = correctSorted === userSorted;
    }

    let localMistakes = JSON.parse(localStorage.getItem('quiz_mistakes') || '[]');

    if (isCorrect) {
        score++;
        scoreEl.innerText = score;
        if (isReviewMode) {
            localMistakes = localMistakes.filter(id => id !== q.id);
            localStorage.setItem('quiz_mistakes', JSON.stringify(localMistakes));
        }
    } else {
        if (!wrongAnswers.includes(q.id)) wrongAnswers.push(q.id);
        if (!localMistakes.includes(q.id)) {
            localMistakes.push(q.id);
            localStorage.setItem('quiz_mistakes', JSON.stringify(localMistakes));
        }
    }

    // 视觉反馈
    const options = container.querySelectorAll('.option-item');
    options.forEach((opt, idx) => {
        const isSelected = userVals.includes(idx);
        let isActual = q.type === 'single' ? (idx === q.answer) : q.answer.includes(idx);
        if (isSelected && isActual) opt.classList.add('feedback-correct');
        else if (isSelected && !isActual) opt.classList.add('feedback-wrong');
        else if (!isSelected && isActual) opt.classList.add('feedback-missed');
    });

    container.querySelectorAll('input').forEach(i => i.disabled = true);
    submitBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
}

function nextQuestion() {
    if (nextBtn.innerText === "返回结果") {
        showResult();
        return;
    }
    currentQuestionIndex++;
    renderQuestion();
}

function showResult() {
    quizView.classList.add('hidden');
    resultView.classList.remove('hidden');
    document.getElementById('final-score').innerText = score;
    
    // ✅ 圆环进度条恢复
    if (questions.length > 0) {
        const pct = (score / questions.length) * 100;
        const circle = document.getElementById('final-circle');
        if (circle) circle.style.setProperty('--score-pct', `${pct}%`);
    }

    const wrongContainer = document.getElementById('wrong-answers-container');
    wrongContainer.innerHTML = '';

    if (wrongAnswers.length === 0) {
        const msg = isReviewMode ? "🎉 复习完成！错题已清零。" : "🎉 完美通关！";
        wrongContainer.innerHTML = `<p style="color:var(--success); width:100%; font-weight:bold;">${msg}</p>`;
    } else {
        wrongAnswers.sort((a,b) => a-b).forEach(id => {
            const btn = document.createElement('div');
            btn.className = 'wrong-item';
            btn.innerText = id;
            btn.onclick = () => jumpToQuestion(id);
            wrongContainer.appendChild(btn);
        });
    }

    // 记录分数
    if(isAnalyticsEnabled && !isReviewMode) {
         db.collection('scores').add({
             userId: localStorage.getItem('quiz_user_id'),
             score: score,
             total: questions.length,
             date: new Date().toISOString()
         }).catch(e => console.log("Score error"));
    }
}

function jumpToQuestion(id) {
    const idx = questions.findIndex(q => q.id === id);
    if (idx !== -1) {
        currentQuestionIndex = idx;
        resultView.classList.add('hidden');
        quizView.classList.remove('hidden');
        renderQuestion();
        nextBtn.innerText = "返回结果";
    }
}

function restartQuiz() {
    isReviewMode = false;
    nextBtn.innerText = "下一题";
    quizView.classList.add('hidden');
    resultView.classList.add('hidden');
    homeView.classList.remove('hidden');
    updateMistakeCount();
}

function updateMistakeCount() {
    const saved = JSON.parse(localStorage.getItem('quiz_mistakes') || '[]');
    const countEl = document.getElementById('mistake-count');
    if(countEl) countEl.innerText = saved.length;
}

// --- 7. 启动 ---
// 恢复最简单的启动方式，加载题目并记录访问
fetchQuestions();
updateMistakeCount();
saveVisitRecord();
