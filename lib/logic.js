/**
* Account transaction
* @param {org.digitalpayment.AccountTransfer} accountTransfer
* @transaction
*/
async function accountTransfer(accountTransfer) {
    if (accountTransfer.from.balance < accountTransfer.amount) {
        throw new Error("Insufficient funds");
    }
    accountTransfer.from.balance -= accountTransfer.amount;
    accountTransfer.to.balance += accountTransfer.amount;

    let assetRegistry = await getAssetRegistry('org.digitalpayment.Account');

    await assetRegistry.update(accountTransfer.from);
    await assetRegistry.update(accountTransfer.to);

}


/**
* Account top-up
* @param {org.digitalpayment.TopUpAccount} topUpAccount
* @transaction
*/
async function topUpAccount(topUpAccount) {
    topUpAccount.to.balance += topUpAccount.amount;
    let assetRegistry = await getAssetRegistry('org.digitalpayment.Account');
    await assetRegistry.update(topUpAccount.to);
}

/**
* Payment
* @param {org.digitalpayment.Payment} payment
* @transaction
*/
async function payment(payment) {
    payment.from.balance -= payment.amount;
    let assetRegistry = await getAssetRegistry('org.digitalpayment.Account');
    await assetRegistry.update(payment.from);
}