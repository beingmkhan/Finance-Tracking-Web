// Personal Finance Tracker Application
// Each user's data is stored in Supabase (Postgres) and protected by
// row-level security, so one user can never see another user's rows.

let supabaseClient = null;
let currentUser = null;
let currentUserProfile = null;
let isSignUpMode = false;

// Maps a data type to the prefix used in its form field ids
const TYPE_PREFIX = { expenses: 'expense', income: 'income', investments: 'investment', assets: 'asset', loans: 'loan' };

// Global Data Storage, populated from Supabase after login
let financeData = { expenses: [], income: [], investments: [], assets: [], loans: [] };

// Category options per type, populated from Supabase after login
let categoriesData = { expenses: [], income: [], investments: [], assets: [], loans: [] };

// Global variables for charts and editing
let charts = {};
let editingItem = null;
let editingType = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_PROJECT_URL' ||
      !SUPABASE_ANON_KEY || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    document.getElementById('authSetupWarning').style.display = 'block';
    document.getElementById('authSubmitBtn').disabled = true;
    return;
  }

  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  initializeAuth();
  initializeNavigation();
  initializeForms();
});

// Authentication
function initializeAuth() {
  document.getElementById('authForm').addEventListener('submit', handleAuthSubmit);
  document.getElementById('authToggleBtn').addEventListener('click', toggleAuthMode);
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      currentUser = session.user;
      showApp();
    } else {
      currentUser = null;
      showAuthScreen();
    }
  });

  supabaseClient.auth.getSession().then(({ data: { session } }) => {
    if (session && session.user) {
      currentUser = session.user;
      showApp();
    } else {
      showAuthScreen();
    }
  });
}

function toggleAuthMode() {
  isSignUpMode = !isSignUpMode;
  document.getElementById('authTitle').textContent = isSignUpMode ? 'Sign Up' : 'Log In';
  document.getElementById('authSubmitBtn').textContent = isSignUpMode ? 'Sign Up' : 'Log In';
  document.getElementById('authToggleText').textContent = isSignUpMode ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('authToggleBtn').textContent = isSignUpMode ? 'Log In' : 'Sign Up';
  hideAuthNotices();
}

function hideAuthNotices() {
  document.getElementById('authError').style.display = 'none';
  document.getElementById('authMessage').style.display = 'none';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  hideAuthNotices();

  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const submitBtn = document.getElementById('authSubmitBtn');
  submitBtn.disabled = true;

  try {
    if (isSignUpMode) {
      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      toggleAuthMode();
      const messageEl = document.getElementById('authMessage');
      messageEl.textContent = 'Account created. Check your email to confirm, then log in.';
      messageEl.style.display = 'block';
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    const errorEl = document.getElementById('authError');
    errorEl.textContent = err.message || 'Something went wrong.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
}

function showAuthScreen() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}

async function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';
  document.getElementById('userEmailDisplay').textContent = currentUser.email;

  await loadProfile();
  await loadCategories();
  await loadAllData();
  renderAllTables();
  updateDashboard();

  if (!charts.monthlyTrends) {
    initializeCharts();
  } else {
    updateCharts();
  }

  if (currentUserProfile && currentUserProfile.is_admin) {
    document.getElementById('adminNavBtn').style.display = 'inline-flex';
    await loadAdminData();
  } else {
    document.getElementById('adminNavBtn').style.display = 'none';
  }
}

// Profile / admin check
async function loadProfile() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  if (error) {
    console.error('Could not load profile:', error);
    currentUserProfile = null;
    return;
  }
  currentUserProfile = data;
}

// Category loading
async function loadCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('name', { ascending: true });

  categoriesData = { expenses: [], income: [], investments: [], assets: [], loans: [] };

  if (error) {
    console.error('Could not load categories:', error);
    return;
  }

  data.forEach(row => {
    if (categoriesData[row.type]) {
      categoriesData[row.type].push({ id: row.id, name: row.name });
    }
  });

  populateCategorySelects();
}

function populateCategorySelects() {
  Object.keys(categoriesData).forEach(type => {
    const select = document.getElementById(`${TYPE_PREFIX[type]}Category`);
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">Select Category</option>';
    categoriesData[type].forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      select.appendChild(option);
    });
    select.value = currentValue;
  });
}

// Admin: users list + category management
async function loadAdminData() {
  await loadUsersList();
  renderCategoryManager();
}

async function loadUsersList() {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  const tbody = document.querySelector('#usersTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (error) {
    console.error('Could not load users:', error);
    return;
  }

  data.forEach(profile => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${profile.email}</td>
      <td>${formatDate(profile.created_at)}</td>
    `;
    tbody.appendChild(row);
  });
}

const TYPE_LABELS = { expenses: 'Expenses', income: 'Income', investments: 'Investments', assets: 'Assets', loans: 'Loans' };

function renderCategoryManager() {
  const container = document.getElementById('categoryManager');
  if (!container) return;

  container.innerHTML = Object.keys(categoriesData).map(type => `
    <div class="category-group">
      <h5>${TYPE_LABELS[type]}</h5>
      <div class="category-chips">
        ${categoriesData[type].map(cat => `
          <span class="category-chip">
            ${cat.name}
            <button type="button" onclick="removeCategory(${cat.id})" title="Remove">&times;</button>
          </span>
        `).join('')}
      </div>
      <div class="category-add">
        <input type="text" class="form-control" id="newCategory-${type}" placeholder="New ${TYPE_LABELS[type].toLowerCase()} category">
        <button type="button" class="btn btn--secondary" onclick="addCategory('${type}')">Add</button>
      </div>
    </div>
  `).join('');
}

async function addCategory(type) {
  const input = document.getElementById(`newCategory-${type}`);
  const name = input.value.trim();
  if (!name) return;

  const { error } = await supabaseClient.from('categories').insert([{ type, name }]);

  if (error) {
    alert('Could not add category: ' + error.message);
    return;
  }

  input.value = '';
  await loadCategories();
  renderCategoryManager();
}

async function removeCategory(id) {
  if (!confirm('Remove this category? Existing entries using it are unaffected.')) return;

  const { error } = await supabaseClient.from('categories').delete().eq('id', id);

  if (error) {
    alert('Could not remove category: ' + error.message);
    return;
  }

  await loadCategories();
  renderCategoryManager();
}

// Data loading
async function loadAllData() {
  const { data, error } = await supabaseClient
    .from('transactions')
    .select('*')
    .order('date', { ascending: false });

  financeData = { expenses: [], income: [], investments: [], assets: [], loans: [] };

  if (error) {
    console.error('Could not load data:', error);
    alert('Could not load your data: ' + error.message);
    return;
  }

  data.forEach(row => {
    if (financeData[row.type]) {
      financeData[row.type].push({
        id: row.id,
        date: row.date,
        description: row.description,
        category: row.category,
        amount: Number(row.amount)
      });
    }
  });
}

// Navigation functionality
function initializeNavigation() {
  const navButtons = document.querySelectorAll('.nav-btn');
  const pages = document.querySelectorAll('.page');
  
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetPage = button.getAttribute('data-page');
      
      // Update navigation
      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Update pages
      pages.forEach(page => page.classList.remove('active'));
      document.getElementById(targetPage).classList.add('active');
      
      // Refresh charts when switching to dashboard
      if (targetPage === 'dashboard') {
        setTimeout(() => {
          updateDashboard();
          updateCharts();
        }, 100);
      }
    });
  });
}

// Form initialization
function initializeForms() {
  // Set default dates to today
  const today = new Date().toISOString().split('T')[0];
  const dateInputs = document.querySelectorAll('input[type="date"]');
  dateInputs.forEach(input => {
    if (!input.value) {
      input.value = today;
    }
  });
  
  // Initialize form handlers
  document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);
  document.getElementById('incomeForm').addEventListener('submit', handleIncomeSubmit);
  document.getElementById('investmentForm').addEventListener('submit', handleInvestmentSubmit);
  document.getElementById('assetForm').addEventListener('submit', handleAssetSubmit);
  document.getElementById('loanForm').addEventListener('submit', handleLoanSubmit);
  
  // Cancel edit buttons
  document.getElementById('cancelExpenseEdit').addEventListener('click', () => cancelEdit('expense'));
  document.getElementById('cancelIncomeEdit').addEventListener('click', () => cancelEdit('income'));
  document.getElementById('cancelInvestmentEdit').addEventListener('click', () => cancelEdit('investment'));
  document.getElementById('cancelAssetEdit').addEventListener('click', () => cancelEdit('asset'));
  document.getElementById('cancelLoanEdit').addEventListener('click', () => cancelEdit('loan'));
}

// Form submission handlers
function handleExpenseSubmit(e) {
  e.preventDefault();
  const formData = {
    date: document.getElementById('expenseDate').value,
    amount: parseFloat(document.getElementById('expenseAmount').value),
    category: document.getElementById('expenseCategory').value,
    description: document.getElementById('expenseDescription').value
  };
  
  if (editingItem && editingType === 'expenses') {
    updateItem('expenses', editingItem.id, formData);
    cancelEdit('expense');
  } else {
    addItem('expenses', formData);
  }
  
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
}

function handleIncomeSubmit(e) {
  e.preventDefault();
  const formData = {
    date: document.getElementById('incomeDate').value,
    amount: parseFloat(document.getElementById('incomeAmount').value),
    category: document.getElementById('incomeCategory').value,
    description: document.getElementById('incomeDescription').value
  };
  
  if (editingItem && editingType === 'income') {
    updateItem('income', editingItem.id, formData);
    cancelEdit('income');
  } else {
    addItem('income', formData);
  }
  
  document.getElementById('incomeForm').reset();
  document.getElementById('incomeDate').value = new Date().toISOString().split('T')[0];
}

function handleInvestmentSubmit(e) {
  e.preventDefault();
  const formData = {
    date: document.getElementById('investmentDate').value,
    amount: parseFloat(document.getElementById('investmentAmount').value),
    category: document.getElementById('investmentCategory').value,
    description: document.getElementById('investmentDescription').value
  };
  
  if (editingItem && editingType === 'investments') {
    updateItem('investments', editingItem.id, formData);
    cancelEdit('investment');
  } else {
    addItem('investments', formData);
  }
  
  document.getElementById('investmentForm').reset();
  document.getElementById('investmentDate').value = new Date().toISOString().split('T')[0];
}

function handleAssetSubmit(e) {
  e.preventDefault();
  const formData = {
    date: document.getElementById('assetDate').value,
    amount: parseFloat(document.getElementById('assetAmount').value),
    category: document.getElementById('assetCategory').value,
    description: document.getElementById('assetDescription').value
  };
  
  if (editingItem && editingType === 'assets') {
    updateItem('assets', editingItem.id, formData);
    cancelEdit('asset');
  } else {
    addItem('assets', formData);
  }
  
  document.getElementById('assetForm').reset();
  document.getElementById('assetDate').value = new Date().toISOString().split('T')[0];
}

function handleLoanSubmit(e) {
  e.preventDefault();
  const formData = {
    date: document.getElementById('loanDate').value,
    amount: parseFloat(document.getElementById('loanAmount').value),
    category: document.getElementById('loanCategory').value,
    description: document.getElementById('loanDescription').value
  };
  
  if (editingItem && editingType === 'loans') {
    updateItem('loans', editingItem.id, formData);
    cancelEdit('loan');
  } else {
    addItem('loans', formData);
  }
  
  document.getElementById('loanForm').reset();
  document.getElementById('loanDate').value = new Date().toISOString().split('T')[0];
}

// CRUD operations
async function addItem(type, data) {
  const { data: inserted, error } = await supabaseClient
    .from('transactions')
    .insert([{ type, date: data.date, description: data.description, category: data.category, amount: data.amount }])
    .select()
    .single();

  if (error) {
    alert('Could not save: ' + error.message);
    return;
  }

  financeData[type].push({
    id: inserted.id,
    date: inserted.date,
    description: inserted.description,
    category: inserted.category,
    amount: Number(inserted.amount)
  });

  renderTable(type);
  updateDashboard();
  updateCharts();
}

async function updateItem(type, id, data) {
  const { error } = await supabaseClient
    .from('transactions')
    .update({ date: data.date, description: data.description, category: data.category, amount: data.amount })
    .eq('id', id);

  if (error) {
    alert('Could not update: ' + error.message);
    return;
  }

  const index = financeData[type].findIndex(item => item.id === id);
  if (index !== -1) {
    financeData[type][index] = { id, ...data };
  }
  renderTable(type);
  updateDashboard();
  updateCharts();
}

async function deleteItem(type, id) {
  if (!confirm('Are you sure you want to delete this item?')) return;

  const { error } = await supabaseClient.from('transactions').delete().eq('id', id);

  if (error) {
    alert('Could not delete: ' + error.message);
    return;
  }

  financeData[type] = financeData[type].filter(item => item.id !== id);
  renderTable(type);
  updateDashboard();
  updateCharts();
}

function editItem(type, id) {
  const item = financeData[type].find(item => item.id === id);
  if (!item) return;
  
  editingItem = item;
  editingType = type;
  
  // Fill form fields
  const actualPrefix = TYPE_PREFIX[type];

  document.getElementById(`${actualPrefix}Date`).value = item.date;
  document.getElementById(`${actualPrefix}Amount`).value = item.amount;
  document.getElementById(`${actualPrefix}Category`).value = item.category;
  document.getElementById(`${actualPrefix}Description`).value = item.description;
  
  // Show cancel button and change submit button text
  document.getElementById(`cancel${actualPrefix.charAt(0).toUpperCase() + actualPrefix.slice(1)}Edit`).style.display = 'inline-flex';
  const submitButton = document.querySelector(`#${actualPrefix}Form button[type="submit"]`);
  submitButton.textContent = `Update ${actualPrefix.charAt(0).toUpperCase() + actualPrefix.slice(1)}`;
}

function cancelEdit(type) {
  editingItem = null;
  editingType = null;
  
  // Reset form
  document.getElementById(`${type}Form`).reset();
  document.getElementById(`${type}Date`).value = new Date().toISOString().split('T')[0];
  
  // Hide cancel button and reset submit button text
  document.getElementById(`cancel${type.charAt(0).toUpperCase() + type.slice(1)}Edit`).style.display = 'none';
  const submitButton = document.querySelector(`#${type}Form button[type="submit"]`);
  submitButton.textContent = `Add ${type.charAt(0).toUpperCase() + type.slice(1)}`;
}

// Table rendering
function renderAllTables() {
  renderTable('expenses');
  renderTable('income');
  renderTable('investments');
  renderTable('assets');
  renderTable('loans');
  renderRecentTransactions();
}

function renderTable(type) {
  const tableId = `${type}Table`;
  const tbody = document.querySelector(`#${tableId} tbody`);
  
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  const sortedData = financeData[type].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  sortedData.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(item.date)}</td>
      <td>${item.description}</td>
      <td>${item.category}</td>
      <td>${formatCurrency(item.amount)}</td>
      <td>
        <button class="btn action-btn edit-btn" onclick="editItem('${type}', ${item.id})">Edit</button>
        <button class="btn action-btn delete-btn" onclick="deleteItem('${type}', ${item.id})">Delete</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

function renderRecentTransactions() {
  const tbody = document.querySelector('#recentTransactionsTable tbody');
  if (!tbody) return;
  
  // Combine all transactions
  const allTransactions = [
    ...financeData.expenses.map(item => ({ ...item, type: 'Expense' })),
    ...financeData.income.map(item => ({ ...item, type: 'Income' })),
    ...financeData.investments.map(item => ({ ...item, type: 'Investment' })),
    ...financeData.assets.map(item => ({ ...item, type: 'Asset' })),
    ...financeData.loans.map(item => ({ ...item, type: 'Loan' }))
  ];
  
  // Sort by date (newest first) and take first 10
  const recentTransactions = allTransactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 10);
  
  tbody.innerHTML = '';
  
  recentTransactions.forEach(transaction => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${formatDate(transaction.date)}</td>
      <td>${transaction.description}</td>
      <td>${transaction.category}</td>
      <td><span class="status status--${getTransactionTypeClass(transaction.type)}">${transaction.type}</span></td>
      <td>${formatCurrency(transaction.amount)}</td>
    `;
    tbody.appendChild(row);
  });
}

function getTransactionTypeClass(type) {
  switch (type) {
    case 'Income': return 'success';
    case 'Expense': return 'error';
    case 'Investment': return 'info';
    case 'Asset': return 'success';
    case 'Loan': return 'warning';
    default: return 'info';
  }
}

// Dashboard calculations and updates
function updateDashboard() {
  const totals = calculateTotals();
  
  // Update summary cards
  document.getElementById('totalIncome').textContent = formatCurrency(totals.income);
  document.getElementById('totalExpenses').textContent = formatCurrency(totals.expenses);
  document.getElementById('totalInvestments').textContent = formatCurrency(totals.investments);
  document.getElementById('totalAssets').textContent = formatCurrency(totals.assets);
  document.getElementById('totalLoans').textContent = formatCurrency(totals.loans);
  
  // Update net worth
  const netWorth = totals.assets - totals.loans;
  document.getElementById('netWorthAmount').textContent = formatCurrency(netWorth);
  document.getElementById('summaryNetWorth').textContent = formatCurrency(netWorth);
  document.getElementById('netWorthChange').textContent = `Total Net Worth`;
}

function calculateTotals() {
  return {
    income: financeData.income.reduce((sum, item) => sum + item.amount, 0),
    expenses: financeData.expenses.reduce((sum, item) => sum + item.amount, 0),
    investments: financeData.investments.reduce((sum, item) => sum + item.amount, 0),
    assets: financeData.assets.reduce((sum, item) => sum + item.amount, 0),
    loans: financeData.loans.reduce((sum, item) => sum + item.amount, 0)
  };
}

// Chart initialization and updates
function initializeCharts() {
  const chartColors = ['#1FB8CD', '#FFC185', '#B4413C', '#ECEBD5', '#5D878F', '#DB4545', '#D2BA4C', '#964325', '#944454', '#13343B'];
  
  // Monthly trends chart
  const monthlyCtx = document.getElementById('monthlyTrendsChart').getContext('2d');
  charts.monthlyTrends = new Chart(monthlyCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Expenses',
        data: [],
        borderColor: chartColors[2],
        backgroundColor: chartColors[2] + '20',
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value.toLocaleString();
            }
          }
        }
      }
    }
  });
  
  // Expense categories pie chart
  const expenseCatCtx = document.getElementById('expenseCategoriesChart').getContext('2d');
  charts.expenseCategories = new Chart(expenseCatCtx, {
    type: 'pie',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: chartColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
  
  // Income vs Expenses bar chart
  const incomeExpCtx = document.getElementById('incomeExpensesChart').getContext('2d');
  charts.incomeExpenses = new Chart(incomeExpCtx, {
    type: 'bar',
    data: {
      labels: ['This Month'],
      datasets: [{
        label: 'Income',
        data: [],
        backgroundColor: chartColors[0]
      }, {
        label: 'Expenses',
        data: [],
        backgroundColor: chartColors[2]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: function(value) {
              return '₹' + value.toLocaleString();
            }
          }
        }
      }
    }
  });
  
  // Asset allocation doughnut chart
  const assetCtx = document.getElementById('assetAllocationChart').getContext('2d');
  charts.assetAllocation = new Chart(assetCtx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: chartColors
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        }
      }
    }
  });
  
  updateCharts();
}

function updateCharts() {
  updateMonthlyTrendsChart();
  updateExpenseCategoriesChart();
  updateIncomeExpensesChart();
  updateAssetAllocationChart();
}

function updateMonthlyTrendsChart() {
  // Group expenses by month
  const monthlyExpenses = {};
  financeData.expenses.forEach(expense => {
    const month = expense.date.substring(0, 7); // YYYY-MM format
    monthlyExpenses[month] = (monthlyExpenses[month] || 0) + expense.amount;
  });
  
  const sortedMonths = Object.keys(monthlyExpenses).sort();
  const labels = sortedMonths.map(month => {
    const [year, monthNum] = month.split('-');
    return new Date(year, monthNum - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  });
  const data = sortedMonths.map(month => monthlyExpenses[month]);
  
  charts.monthlyTrends.data.labels = labels;
  charts.monthlyTrends.data.datasets[0].data = data;
  charts.monthlyTrends.update();
}

function updateExpenseCategoriesChart() {
  const categoryExpenses = {};
  financeData.expenses.forEach(expense => {
    categoryExpenses[expense.category] = (categoryExpenses[expense.category] || 0) + expense.amount;
  });
  
  charts.expenseCategories.data.labels = Object.keys(categoryExpenses);
  charts.expenseCategories.data.datasets[0].data = Object.values(categoryExpenses);
  charts.expenseCategories.update();
}

function updateIncomeExpensesChart() {
  const totals = calculateTotals();
  
  charts.incomeExpenses.data.datasets[0].data = [totals.income];
  charts.incomeExpenses.data.datasets[1].data = [totals.expenses];
  charts.incomeExpenses.update();
}

function updateAssetAllocationChart() {
  const assetCategories = {};
  financeData.assets.forEach(asset => {
    assetCategories[asset.category] = (assetCategories[asset.category] || 0) + asset.amount;
  });
  
  charts.assetAllocation.data.labels = Object.keys(assetCategories);
  charts.assetAllocation.data.datasets[0].data = Object.values(assetCategories);
  charts.assetAllocation.update();
}

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Export functionality
function exportData(type) {
  const data = financeData[type];
  if (!data || data.length === 0) {
    alert('No data to export');
    return;
  }
  
  const headers = ['Date', 'Description', 'Category', 'Amount'];
  const csvContent = [
    headers.join(','),
    ...data.map(item => [
      item.date,
      `"${item.description}"`,
      item.category,
      item.amount
    ].join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${type}-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Make functions globally available for inline event handlers
window.editItem = editItem;
window.deleteItem = deleteItem;
window.exportData = exportData;
window.addCategory = addCategory;
window.removeCategory = removeCategory;