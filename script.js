const STORAGE_KEY = "billbuddy-bills-v1";
const CURRENCY = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
});
const DATE_FORMAT = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
});
const CATEGORY_ICONS = {
    Utilities: "⚡",
    Home: "⌂",
    Subscriptions: "▶",
    "Phone & Internet": "▤",
    Insurance: "♡",
    Transport: "↗",
    Other: "◈"
};

const billList = document.querySelector("#bill-list");
const upcomingList = document.querySelector("#upcoming-list");
const billDialog = document.querySelector("#bill-dialog");
const billForm = document.querySelector("#bill-form");
const toast = document.querySelector("#toast");
let activeFilter = "all";
let searchTerm = "";
let toastTimeout;
let bills = loadBills();

function loadBills() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return [];
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed)) throw new Error("Saved bill data is not a list.");
        return parsed.filter(isValidBill);
    } catch (error) {
        console.error("Could not load saved bills:", error);
        showToast("Saved reminders couldn’t be loaded. You can still add new bills.");
        return [];
    }
}

function isValidBill(bill) {
    return bill && typeof bill.id === "string" &&
        typeof bill.name === "string" && bill.name.trim() !== "" &&
        Number.isFinite(Number(bill.amount)) && Number(bill.amount) > 0 &&
        isValidDate(bill.dueDate) && typeof bill.category === "string" &&
        typeof bill.paid === "boolean";
}

function saveBills() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bills));
        return true;
    } catch (error) {
        console.error("Could not save bills:", error);
        showToast("Your changes couldn’t be saved in this browser.");
        return false;
    }
}

function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = parseDate(value);
    const [year, month, day] = value.split("-").map(Number);
    return date instanceof Date && !Number.isNaN(date.getTime()) &&
        date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseDate(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function daysUntil(dateString) {
    const today = parseDate(localDateString());
    const dueDate = parseDate(dateString);
    return Math.round((dueDate - today) / 86400000);
}

function getStatus(bill) {
    if (bill.paid) return { label: "Paid", className: "status-paid" };
    const remaining = daysUntil(bill.dueDate);
    if (remaining < 0) return { label: "Overdue", className: "status-overdue" };
    if (remaining === 0) return { label: "Due today", className: "status-due-soon" };
    if (remaining <= 7) return { label: "Due soon", className: "status-due-soon" };
    return { label: "Upcoming", className: "status-upcoming" };
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

function formatAmount(amount) {
    return CURRENCY.format(Number(amount));
}

function formatDate(dateString) {
    return DATE_FORMAT.format(parseDate(dateString));
}

function getFilteredBills() {
    return bills
        .filter(bill => {
            const status = getStatus(bill);
            if (activeFilter === "upcoming" && (bill.paid || status.label === "Overdue")) return false;
            if (activeFilter === "overdue" && status.label !== "Overdue") return false;
            if (activeFilter === "paid" && !bill.paid) return false;
            const query = searchTerm.trim().toLocaleLowerCase();
            return !query || `${bill.name} ${bill.category}`.toLocaleLowerCase().includes(query);
        })
        .sort((first, second) => first.dueDate.localeCompare(second.dueDate));
}

function renderBill(bill) {
    const status = getStatus(bill);
    const categoryClass = bill.category.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const paidAction = bill.paid ? "Undo paid" : "Mark as paid";
    return `
        <article class="bill-row">
            <div class="bill-main">
                <span class="category-icon category-${escapeHTML(categoryClass)}" aria-hidden="true">${CATEGORY_ICONS[bill.category] || CATEGORY_ICONS.Other}</span>
                <div class="bill-details">
                    <div class="bill-name">${escapeHTML(bill.name)}</div>
                    <div class="bill-category">${escapeHTML(bill.category)}</div>
                </div>
            </div>
            <div class="bill-due">${formatDate(bill.dueDate)}</div>
            <div class="bill-amount">${formatAmount(bill.amount)}</div>
            <div class="bill-action">
                <span class="status-pill ${status.className}">${status.label}</span>
                <details class="row-menu">
                    <summary aria-label="Actions for ${escapeHTML(bill.name)}">···</summary>
                    <div class="row-actions">
                        <button type="button" data-action="toggle-paid" data-id="${escapeHTML(bill.id)}">${paidAction}</button>
                        <button class="delete-action" type="button" data-action="delete" data-id="${escapeHTML(bill.id)}">Delete reminder</button>
                    </div>
                </details>
            </div>
        </article>`;
}

function renderEmptyBills() {
    if (searchTerm.trim() || activeFilter !== "all") {
        return `<div class="empty-state">
            <span class="empty-icon" aria-hidden="true">⌕</span>
            <h3>No bills found</h3>
            <p>Try another search or filter to find what you’re looking for.</p>
        </div>`;
    }
    return `<div class="empty-state">
        <span class="empty-icon" aria-hidden="true">✦</span>
        <h3>Your list starts here</h3>
        <p>Add a bill and its due date to keep your next payment in view.</p>
    </div>`;
}

function renderUpcoming() {
    const upcoming = bills
        .filter(bill => !bill.paid)
        .sort((first, second) => first.dueDate.localeCompare(second.dueDate))
        .slice(0, 5);

    if (upcoming.length === 0) {
        upcomingList.innerHTML = `<div class="upcoming-empty">No upcoming payments. Enjoy the breathing room!</div>`;
        return;
    }

    upcomingList.innerHTML = upcoming.map(bill => {
        const dueDate = parseDate(bill.dueDate);
        const month = new Intl.DateTimeFormat("en", { month: "short" }).format(dueDate);
        return `<div class="upcoming-item">
            <div class="date-block"><span>${month}</span><span>${dueDate.getDate()}</span></div>
            <div class="upcoming-info">
                <div class="upcoming-name">${escapeHTML(bill.name)}</div>
                <div class="upcoming-category">${escapeHTML(bill.category)}</div>
            </div>
            <div class="upcoming-amount">${formatAmount(bill.amount)}</div>
        </div>`;
    }).join("");
}

function renderStats() {
    const unpaid = bills.filter(bill => !bill.paid);
    const overdue = unpaid.filter(bill => daysUntil(bill.dueDate) < 0);
    const dueSoon = unpaid.filter(bill => {
        const remaining = daysUntil(bill.dueDate);
        return remaining >= 0 && remaining <= 7;
    });
    const now = new Date();
    const paidThisMonth = bills.filter(bill => {
        if (!bill.paid || !bill.paidAt) return false;
        const paidDate = parseDate(bill.paidAt);
        return paidDate.getFullYear() === now.getFullYear() && paidDate.getMonth() === now.getMonth();
    });

    document.querySelector("#upcoming-total").textContent =
        formatAmount(unpaid.reduce((total, bill) => total + Number(bill.amount), 0));
    document.querySelector("#upcoming-count").textContent = `${unpaid.length} ${unpaid.length === 1 ? "bill" : "bills"}`;
    document.querySelector("#due-soon-count").textContent = String(dueSoon.length);
    document.querySelector("#overdue-count").textContent = String(overdue.length);
    document.querySelector("#paid-total").textContent =
        formatAmount(paidThisMonth.reduce((total, bill) => total + Number(bill.amount), 0));
    document.querySelector("#paid-count").textContent = `${paidThisMonth.length} ${paidThisMonth.length === 1 ? "bill" : "bills"}`;

    document.querySelector("#filter-all-count").textContent = String(bills.length);
    document.querySelector("#filter-upcoming-count").textContent =
        String(unpaid.filter(bill => daysUntil(bill.dueDate) >= 0).length);
    document.querySelector("#filter-overdue-count").textContent = String(overdue.length);
    document.querySelector("#filter-paid-count").textContent = String(bills.filter(bill => bill.paid).length);
}

function render() {
    const visibleBills = getFilteredBills();
    billList.innerHTML = visibleBills.length ? visibleBills.map(renderBill).join("") : renderEmptyBills();
    renderStats();
    renderUpcoming();
}

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 3000);
}

function openDialog() {
    billForm.reset();
    billForm.elements.dueDate.value = localDateString();
    billDialog.showModal();
    billForm.elements.name.focus();
}

document.querySelector("#today-label").textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
}).format(new Date());

document.querySelector("#add-bill-button").addEventListener("click", openDialog);
document.querySelector("#close-dialog").addEventListener("click", () => billDialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => billDialog.close());
document.querySelector("#search-bills").addEventListener("input", event => {
    searchTerm = event.target.value;
    render();
});

document.querySelectorAll(".filter-button").forEach(button => {
    button.addEventListener("click", () => {
        activeFilter = button.dataset.filter;
        document.querySelectorAll(".filter-button").forEach(filterButton => {
            const selected = filterButton === button;
            filterButton.classList.toggle("selected", selected);
            filterButton.setAttribute("aria-pressed", String(selected));
        });
        render();
    });
});

billForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!billForm.reportValidity()) return;

    const formData = new FormData(billForm);
    const bill = {
        id: typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: String(formData.get("name")).trim(),
        amount: Number(formData.get("amount")),
        dueDate: String(formData.get("dueDate")),
        category: String(formData.get("category")),
        paid: false,
        paidAt: null
    };

    if (!bill.name || !Number.isFinite(bill.amount) || bill.amount <= 0 || !isValidDate(bill.dueDate)) {
        showToast("Please enter a bill name, valid amount, and due date.");
        return;
    }

    bills.push(bill);
    const saved = saveBills();
    render();
    billDialog.close();
    if (saved) showToast("Bill reminder added.");
});

billList.addEventListener("click", event => {
    const actionButton = event.target.closest("button[data-action]");
    if (!actionButton) return;

    const bill = bills.find(item => item.id === actionButton.dataset.id);
    if (!bill) return;

    if (actionButton.dataset.action === "delete") {
        if (!window.confirm(`Delete the reminder for “${bill.name}”?`)) return;
        bills = bills.filter(item => item.id !== bill.id);
        const saved = saveBills();
        render();
        if (saved) showToast("Bill reminder deleted.");
    } else if (actionButton.dataset.action === "toggle-paid") {
        bill.paid = !bill.paid;
        bill.paidAt = bill.paid ? localDateString() : null;
        const saved = saveBills();
        render();
        if (saved) showToast(bill.paid ? "Nice work — bill marked as paid." : "Bill marked as unpaid.");
    }
});

billList.addEventListener("toggle", event => {
    if (event.target.matches(".row-menu[open]")) {
        billList.querySelectorAll(".row-menu[open]").forEach(menu => {
            if (menu !== event.target) menu.removeAttribute("open");
        });
    }
}, true);

render();
