

// --- 1. 配置区域 (替换为您自己的 Firebase 配置) ---
// 如何获取：前往 console.firebase.google.com -> 创建项目 -> 添加 Web 应用 -> 复制配置
const firebaseConfig = {
    apiKey: "AIzaSyBwfDRnXxg7pouAsAdOXuNFP0BnnDWlK3I",
  authDomain: "quizapp-c204a.firebaseapp.com",
  projectId: "quizapp-c204a",
  storageBucket: "quizapp-c204a.firebasestorage.app",
  messagingSenderId: "117422520372",
  appId: "1:117422520372:web:d706372f702539f448f261",
};

// --- 2. 初始化 Analytics (隐形追踪) ---
let db;
let isAnalyticsEnabled = false;

function initAnalytics() {
    try {
        // 检查是否配置了 API Key，如果还是默认文本，则不启动
        if (firebaseConfig.apiKey === "YOUR_API_KEY") {
            console.warn("Firebase 未配置，跳过追踪初始化。");
            return;
        }

        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        isAnalyticsEnabled = true;

        // 识别用户
        let userId = localStorage.getItem('quiz_user_id');
        let isNewUser = false;
        
        if (!userId) {
            // 生成新 ID (简单的随机串)
            userId = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
            localStorage.setItem('quiz_user_id', userId);
            isNewUser = true;
        }

        // 记录访问日志
        const visitData = {
            userId: userId,
            visitTime: new Date().toISOString(),
            isNewUser: isNewUser,
            userAgent: navigator.userAgent, // 获取设备信息
            screenSize: `${window.innerWidth}x${window.innerHeight}`
        };

        // 发送到 Firestore 的 'visits' 集合
        db.collection('visits').add(visitData)
            .then(() => console.log("Log saved."))
            .catch(err => console.error("Log error", err));

    } catch (e) {
        console.error("Firebase Init Error:", e);
    }
}

// 页面加载即启动追踪
initAnalytics();
// --- 3. 刷题核心逻辑 ---
let rawQuestions = [];
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let wrongAnswers = [];
let isReviewMode = false;

// DOM 元素
const homeView = document.getElementById('home-view');
const quizView = document.getElementById('quiz-view');
const resultView = document.getElementById('result-view');
const container = document.getElementById('question-container');
const progressEl = document.getElementById('progress');
const scoreEl = document.getElementById('current-score');
const submitBtn = document.getElementById('submit-btn');
const nextBtn = document.getElementById('next-btn');

// 加载 JSON 数据
async function fetchQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error('Network response was not ok');
        rawQuestions = await response.json();
    } catch (error) {
        alert("题目加载失败，请检查 questions.json 文件是否存在。");
        console.error(error);
    }
}

// 初始化游戏
async function initGame(mode) {
    if (rawQuestions.length === 0) await fetchQuestions();
    
    let tempQuestions = JSON.parse(JSON.stringify(rawQuestions));
    
    if (mode === 'random') {
        // 洗牌算法
        for (let i = tempQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tempQuestions[i], tempQuestions[j]] = [tempQuestions[j], tempQuestions[i]];
        }
    }

    questions = tempQuestions.map(q => ({
        ...q,
        userAnswer: null
    }));

    currentQuestionIndex = 0;
    score = 0;
    wrongAnswers = [];
    isReviewMode = false;
    scoreEl.innerText = 0;

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
                <label class="option-item" data-idx="${idx}" data-type="${q.type}">
                    <div class="option-icon"></div>
                    <input type="${isMulti ? 'checkbox' : 'radio'}" name="opt" value="${idx}">
                    <span class="option-text">${String.fromCharCode(65 + idx)}. ${opt}</span>
                </label>
            `).join('')}
        </div>
    `;
    
    // 淡入动画
    container.style.opacity = '0';
    setTimeout(() => {
        container.style.transition = 'opacity 0.4s ease';
        container.style.opacity = '1';
    }, 10);

    submitBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    container.style.pointerEvents = 'auto';

    // 绑定选项点击
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
    
    if (inputs.length === 0) {
        submitBtn.style.transform = 'translateX(5px)';
        setTimeout(() => submitBtn.style.transform = 'translateX(0)', 100);
        return;
    }

    let userVals = Array.from(inputs).map(i => parseInt(i.value));
    let isCorrect = false;

    if (q.type === 'single') {
        isCorrect = userVals[0] === q.answer;
    } else {
        const correctSorted = [...q.answer].sort().toString();
        const userSorted = [...userVals].sort().toString();
        isCorrect = correctSorted === userSorted;
    }

    if (isCorrect) {
        score++;
        scoreEl.innerText = score;
        scoreEl.style.transform = 'scale(1.2)';
        setTimeout(() => scoreEl.style.transform = 'scale(1)', 200);
    } else {
        if (!wrongAnswers.includes(q.id)) wrongAnswers.push(q.id);
    }

    // 渲染反馈
    const options = container.querySelectorAll('.option-item');
    options.forEach((opt, idx) => {
        const isSelected = userVals.includes(idx);
        let isActualAnswer = q.type === 'single' ? (idx === q.answer) : q.answer.includes(idx);

        if (isSelected && isActualAnswer) opt.classList.add('feedback-correct');
        else if (isSelected && !isActualAnswer) opt.classList.add('feedback-wrong');
        else if (!isSelected && isActualAnswer) opt.classList.add('feedback-missed');
    });

    container.querySelectorAll('input').forEach(i => i.disabled = true);
    container.querySelectorAll('.option-item').forEach(i => i.style.cursor = 'default');

    submitBtn.classList.add('hidden');
    nextBtn.classList.remove('hidden');
}

function nextQuestion() {
    if (isReviewMode) {
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
    const pct = (score / questions.length) * 100;
    document.getElementById('final-circle').style.setProperty('--score-pct', `${pct}%`);

    const wrongContainer = document.getElementById('wrong-answers-container');
    wrongContainer.innerHTML = '';

    if (wrongAnswers.length === 0) {
        wrongContainer.innerHTML = '<p style="color:var(--success); width:100%;">完美通关！</p>';
    } else {
        wrongAnswers.sort((a,b) => a-b).forEach(id => {
            const btn = document.createElement('div');
            btn.className = 'wrong-item';
            btn.innerText = id;
            btn.onclick = () => jumpToQuestion(id);
            wrongContainer.appendChild(btn);
        });
    }

    // 可以在这里上传本次得分到 Firebase (可选)
    if(isAnalyticsEnabled) {
         db.collection('scores').add({
             userId: localStorage.getItem('quiz_user_id'),
             score: score,
             total: questions.length,
             date: new Date().toISOString()
         });
    }
}

function jumpToQuestion(id) {
    const idx = questions.findIndex(q => q.id === id);
    if (idx !== -1) {
        currentQuestionIndex = idx;
        isReviewMode = true;
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
}

// 预加载

fetchQuestions();


