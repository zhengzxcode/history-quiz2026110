// --- 1. 配置区域 (您的配置已保留) ---
const firebaseConfig = {
    apiKey: "AIzaSyBwfDRnXxg7pouAsAdOXuNFP0BnnDWlK3I",
    authDomain: "quizapp-c204a.firebaseapp.com",
    projectId: "quizapp-c204a",
    storageBucket: "quizapp-c204a.firebasestorage.app",
    messagingSenderId: "117422520372",
    appId: "1:117422520372:web:d706372f702539f448f261",
};

// --- 2. 变量初始化 (改为全局变量，防止加载顺序错误) ---
let db;
let isAnalyticsEnabled = false;
// 先声明变量，不要立刻获取，等页面加载完再获取
let homeView, quizView, resultView, container, progressEl, scoreEl, submitBtn, nextBtn;

let rawQuestions = [];
let questions = [];
let currentQuestionIndex = 0;
let score = 0;
let wrongAnswers = [];
let isReviewMode = false;

// --- 3. 初始化 Firebase & 高级追踪功能 ---
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    isAnalyticsEnabled = true;
} catch (e) {
    console.error("Firebase Init Error:", e);
}

// 获取 IP 地址
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip;
    } catch (error) {
        return "Unknown_IP";
    }
}

// 获取设备名称
function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone/iPad";
    if (/Android/i.test(ua)) return "Android 手机";
    if (/Windows/i.test(ua)) return "Windows 电脑";
    if (/Macintosh|Mac OS X/i.test(ua)) return "Mac 电脑";
    return "其他设备";
}

// 记录访问 (包含 IP、设备、时间)
async function saveVisitRecord() {
    // Session 防刷：浏览器未关闭前不重复记录
    if (sessionStorage.getItem('has_recorded_session')) return;

    const ip = await getClientIP();
    const deviceName = getDeviceName();
    
    let userId = localStorage.getItem('quiz_user_id');
    let isNewUser = false;
    if (!userId) {
        userId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('quiz_user_id', userId);
        isNewUser = true;
    }

    if (isAnalyticsEnabled) {
        // 数据存入 user_logs_pro
        db.collection('user_logs_pro').add({
            ip: ip,
            deviceSimple: deviceName,
            visitTime: new Date().toLocaleString(),
            isNewUser: isNewUser,
            userId: userId,
            fullAgent: navigator.userAgent
        }).then(() => {
            console.log("记录发送成功");
            sessionStorage.setItem('has_recorded_session', 'true');
        }).catch(e => console.error("记录失败", e));
    }
}

// --- 4. 核心逻辑 ---

async function fetchQuestions() {
    try {
        const response = await fetch('questions.json');
        if (!response.ok) throw new Error('Network response was not ok');
        rawQuestions = await response.json();
    } catch (error) {
        console.error("Load Error:", error);
    }
}

async function initGame(mode) {
    // 再次确保元素已获取（双重保险）
    if (!homeView) {
        console.error("DOM尚未加载完成");
        return;
    }

    if (rawQuestions.length === 0) {
        await fetchQuestions();
        if (rawQuestions.length === 0) return;
    }
    
    let tempQuestions = [];

    if (mode === 'review') {
        const savedMistakes = JSON.parse(localStorage.getItem('quiz_mistakes') || '[]');
        if (savedMistakes.length === 0) {
            alert("错题本是空的！快去刷题积累一点吧~");
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
    scoreEl.innerText = 0;
    nextBtn.innerText = "下一题";

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
    
    container.style.opacity = '0';
    setTimeout(() => {
        container.style.transition = 'opacity 0.4s ease';
        container.style.opacity = '1';
    }, 10);

    submitBtn.classList.remove('hidden');
    nextBtn.classList.add('hidden');
    container.style.pointerEvents = 'auto';

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
    
    // ✅ 完美修复：只要有题目，就显示圆环（删除了 !isReviewMode 限制）
    if (questions.length > 0) {
        const pct = (score / questions.length) * 100;
        document.getElementById('final-circle').style.setProperty('--score-pct', `${pct}%`);
    }

    const wrongContainer = document.getElementById('wrong-answers-container');
    wrongContainer.innerHTML = '';

    if (wrongAnswers.length === 0) {
        const msg = isReviewMode ? "🎉 复习完成！错题已全部掌握。" : "🎉 完美通关！";
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

    // 记录得分
    if(isAnalyticsEnabled && !isReviewMode) {
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

// ✅ 核心修复：必须在 window.onload 里获取元素，否则点击无反应
window.onload = async function() {
    // 1. 在页面加载完毕后，再去抓取 HTML 元素
    homeView = document.getElementById('home-view');
    quizView = document.getElementById('quiz-view');
    resultView = document.getElementById('result-view');
    container = document.getElementById('question-container');
    progressEl = document.getElementById('progress');
    scoreEl = document.getElementById('current-score');
    submitBtn = document.getElementById('submit-btn');
    nextBtn = document.getElementById('next-btn');

    // 2. 启动各项逻辑
    await saveVisitRecord(); // 发送 IP 记录
    fetchQuestions();        // 加载题库
    updateMistakeCount();    // 显示错题数
};
