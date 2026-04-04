function doGet() {
    return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('Universal Card Tracker')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function computeWalletStats(cardsData, transData) {
    const activeIds = {};
    for (let i = 1; i < cardsData.length; i++) {
        const id = cardsData[i][0];
        const isArchived = (cardsData[i][9] === true || cardsData[i][9] === 'TRUE' || cardsData[i][9] === 'true');
        if (!isArchived && id) {
            activeIds[id] = true;
        }
    }

    const now = new Date();
    const cutoff30 = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    cutoff30.setHours(0, 0, 0, 0);
    const currentYear = now.getFullYear();

    let spentLast30 = 0;
    let spentYear = 0;
    let count30 = 0;

    for (let j = 1; j < transData.length; j++) {
        const cardId = transData[j][1];
        if (!activeIds[cardId]) continue;

        const amount = parseFloat(transData[j][2]) || 0;
        if (amount <= 0) continue;

        const raw = transData[j][0];
        const transDate = raw instanceof Date ? raw : new Date(raw);
        if (isNaN(transDate.getTime())) continue;

        if (transDate.getTime() >= cutoff30.getTime()) {
            spentLast30 += amount;
            count30++;
        }

        if (transDate.getFullYear() === currentYear) {
            spentYear += amount;
        }
    }

    const avgPurchaseLast30 = count30 > 0 ? spentLast30 / count30 : 0;

    return {
        spentLast30: Math.round(spentLast30 * 100) / 100,
        spentYear: Math.round(spentYear * 100) / 100,
        avgPurchaseLast30: Math.round(avgPurchaseLast30 * 100) / 100,
        yearLabel: String(currentYear)
    };
}

function getCards() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cardsSheet = ss.getSheetByName("Cards");
    const transSheet = ss.getSheetByName("Transactions");

    const cardsData = cardsSheet.getDataRange().getValues();
    const transData = transSheet.getDataRange().getValues();

    const cards = [];

    for (let i = 1; i < cardsData.length; i++) {
        const cardId = cardsData[i][0];
        const brand = cardsData[i][1] || "Unknown Brand";
        const type = cardsData[i][2];
        const initialBalance = parseFloat(cardsData[i][4]) || 0;
        const url = cardsData[i][5];
        const cardNumber = cardsData[i][6] || "";
        const pin = cardsData[i][7] || "";
        const balanceUrl = cardsData[i][8] || "";
        const isArchived = (cardsData[i][9] === true || cardsData[i][9] === 'TRUE' || cardsData[i][9] === 'true');

        let currentBalance = initialBalance;
        for (let j = 1; j < transData.length; j++) {
            if (transData[j][1] === cardId) {
                currentBalance -= (parseFloat(transData[j][2]) || 0);
            }
        }

        cards.push({
            id: cardId,
            brand: brand,
            type: type,
            initial: initialBalance,
            current: currentBalance,
            url: url,
            cardNumber: cardNumber,
            pin: pin,
            balanceUrl: balanceUrl,
            archived: isArchived
        });
    }
    return {
        cards: cards,
        stats: computeWalletStats(cardsData, transData)
    };
}

function saveCard(brand, type, initialBalance, imageBase64, filename, cardNumber, pin, balanceUrl) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards");
    const cardId = "CARD_" + new Date().getTime();
    let fileUrl = "";

    if (imageBase64 && type === "Digital") {
        const folderName = "Gift Card Tracker App";
        const folderList = DriveApp.getFoldersByName(folderName);
        const folder = folderList.hasNext() ? folderList.next() : DriveApp.createFolder(folderName);

        const splitBase = imageBase64.split(',');
        const typeStr = splitBase[0].split(';')[0].replace('data:', '');
        const decoded = Utilities.base64Decode(splitBase[1]);
        const blob = Utilities.newBlob(decoded, typeStr, cardId + "_" + filename);

        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fileUrl = "https://drive.google.com/file/d/" + file.getId() + "/view";
    }

    sheet.appendRow([cardId, brand, type, new Date(), initialBalance, fileUrl, cardNumber || "", pin || "", balanceUrl || ""]);
    return getCards();
}

function recalculateBalances(cardId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cardsSheet = ss.getSheetByName("Cards");
    const transSheet = ss.getSheetByName("Transactions");

    const cardsData = cardsSheet.getDataRange().getValues();
    let initialBalance = 0;
    for (let i = 1; i < cardsData.length; i++) {
        if (cardsData[i][0] === cardId) {
            initialBalance = parseFloat(cardsData[i][4]) || 0;
            break;
        }
    }

    const transRange = transSheet.getDataRange();
    const transData = transRange.getValues();
    let runningBalance = initialBalance;

    for (let i = 1; i < transData.length; i++) {
        if (transData[i][1] === cardId) {
            let amt = parseFloat(transData[i][2]) || 0;
            runningBalance -= amt;
            transSheet.getRange(i + 1, 4).setValue(runningBalance);
        }
    }
}

function addTransaction(cardId, amount, note) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const transSheet = ss.getSheetByName("Transactions");

    transSheet.appendRow([new Date(), cardId, amount, 0, note || ""]);
    recalculateBalances(cardId);
    return getCards();
}

function getTransactions(cardId) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Transactions");
    const data = sheet.getDataRange().getValues();
    const trans = [];

    for (let i = 1; i < data.length; i++) {
        if (data[i][1] === cardId) {
            trans.push({
                rowId: i + 1,
                date: Utilities.formatDate(new Date(data[i][0]), Session.getScriptTimeZone(), "MM/dd/yyyy"),
                amount: parseFloat(data[i][2]) || 0,
                balance: parseFloat(data[i][3]) || 0,
                note: data[i][4] || ""
            });
        }
    }
    return trans.reverse();
}

function updateCardDetails(cardId, newBrand, newInitialBalance, newCardNum, newPin, newBalanceUrl) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === cardId) {
            sheet.getRange(i + 1, 2).setValue(newBrand);
            sheet.getRange(i + 1, 5).setValue(newInitialBalance);
            sheet.getRange(i + 1, 7).setValue(newCardNum);
            sheet.getRange(i + 1, 8).setValue(newPin);
            sheet.getRange(i + 1, 9).setValue(newBalanceUrl);
            break;
        }
    }
    recalculateBalances(cardId);
    return getCards();
}

function editTransaction(rowId, cardId, newAmount, newNote) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Transactions");
    sheet.getRange(rowId, 3).setValue(newAmount);
    sheet.getRange(rowId, 5).setValue(newNote);
    recalculateBalances(cardId);
    return getCards();
}

function deleteTransaction(rowId, cardId) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Transactions");
    sheet.deleteRow(rowId);
    recalculateBalances(cardId);
    return getCards();
}

function toggleArchive(cardId, status) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Cards");
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
        if (data[i][0] === cardId) {
            sheet.getRange(i + 1, 10).setValue(status);
            break;
        }
    }
    return getCards();
}