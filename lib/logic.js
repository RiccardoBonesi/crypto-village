/**
* Account transaction
* @param {org.digitalpayment.AccountTransfer} accountTransfer
* @transaction
*/
async function accountTransfer(accountTransfer) {
    if (accountTransfer.from.balance < accountTransfer.amount) {
        throw new Error("Insufficient funds");
    }

    var from = accountTransfer.from;
    var to = accountTransfer.to;
    var fromCustomer = from.owner;
    var fromCustomerFamily = fromCustomer.family;

    var fee = false;

    // if receiver is not part of sender's family fee are applied
    if (!fromCustomerFamily || !fromCustomerFamily.includes(to)) {
        fee = true;
    }

    if (fee) {
        accountTransfer.from.balance -= (accountTransfer.amount + 5);
    } else {
        accountTransfer.from.balance -= accountTransfer.amount;
    }

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
    if (payment.from.balance < payment.amount) {
        throw new Error("Insufficient funds");
    }

    payment.from.balance -= payment.amount;
    let assetRegistry = await getAssetRegistry('org.digitalpayment.Account');

    // emit a notification that a payment has occurred
    // TODO test when deployed
    let paymentNotification = getFactory().newEvent('org.digitalpayment', 'PaymentNotification');
    paymentNotification.account = payment.from;
    emit(paymentNotification);

    await assetRegistry.update(payment.from);
}

/**
 * @param {org.digitalpayment.BuyLotteryTicket} transactionRequest
 * @transaction
 */
async function BuyLotteryTicket(transactionRequest) {
    // TODO gestire permessi

    let ticketDetails = transactionRequest.ticketDetails;
    let ticketRegistry = await getAssetRegistry('org.digitalpayment.LotteryTicket')
    let factory = await getFactory();
    let ticket = await factory.newResource('org.digitalpayment', 'LotteryTicket', ticketDetails.ticketId)
    let lottery = transactionRequest.lottery;
    let ticketOwner = transactionRequest.ticketOwner;

    ticket.lottery = lottery;
    ticket.ticketOwner = ticketOwner.owner;
    ticket.price = lottery.price;

    console.log(ticketOwner)
    console.log(ticketOwner.owner)


    if (lottery.status !== "OPEN") {
        throw new Error("Lottery is not open");
    }

    if (ticketOwner.balance < ticket.price) {
        throw new Error("Insufficient funds");
    }

    var lotteryTickets = lottery.tickets;

    // check if User have already bought enough tickets
    var count = 0;
    var participants = [];
    for (var i = 0; i < lotteryTickets.length; i++) {        
        if (!participants.includes(lotteryTickets[i].ticketOwner.customerId)) {
            participants.push(lotteryTickets[i].ticketOwner.customerId);
        }
        if (lotteryTickets[i].ticketOwner.customerId === ticketOwner.owner.customerId) {            
            count++;
        }
    }
    if (count >= lottery.ticketsPerUser) {
        throw new Error("User have already bought " + lottery.ticketsPerUser + " tickets");
    }

    // associate ticket to User and decrease balance
    ticketOwner.balance -= ticket.price;
    let accountRegistry = await getAssetRegistry('org.digitalpayment.Account');
    await accountRegistry.update(ticketOwner);

    // add the new ticket in the lottery
    lotteryTickets.push(ticket);

    lottery.num_tickets += 1;
    lottery.amount += ticket.price;

    await ticketRegistry.add(ticket);

    for (var i = 0; i < lotteryTickets.length; i++) {
        if (!participants.includes(lotteryTickets[i].ticketOwner.customerId)) {
            participants.push(lotteryTickets[i].ticketOwner.customerId);
        }
    }
    lottery.participants = participants.length;

    let lotteryRegistry = await getAssetRegistry('org.digitalpayment.Lottery');
    await lotteryRegistry.update(lottery);
}

/**
 * @param {org.digitalpayment.DrawLottery} transactionRequest
 * @transaction
 */
async function DrawLottery(transactionRequest) {    
    // TODO gestire permessi

    var lottery = transactionRequest.lottery;
    var ticketsCount = lottery.num_tickets;
    var lotteryTickets = lottery.tickets;
    var num_winners = lottery.num_winners;
    var winners = lottery.winners;
    

    var min = 0;
    var max = ticketsCount;
    var tempTickets = lotteryTickets.slice(); // clone array

    // choose random winners
    for (i = 0; i < num_winners; i++) {        
        var random = Math.floor(Math.random() * (+max - +min)) + +min;
        var winner = tempTickets[random];        
        winners.push(winner);        
        tempTickets.splice(random, 1); // remove tempTickets[random]
        ticketsCount -= 1;
    }    

    lottery.status = "CLOSE";

    let lotteryRegistry = await getAssetRegistry('org.digitalpayment.Lottery');
    await lotteryRegistry.update(lottery);
}

/**
 * @param {org.digitalpayment.BookTrip} transactionRequest
 * @transaction
 */
async function BookTrip(transactionRequest) {

    var trip = transactionRequest.trip;

    if (trip.status !== "OPEN") {
        throw new Error("Maximum participants reached");
    }

    var tripParticipants = trip.participants;
    var booker = transactionRequest.booker;

    if (tripParticipants.includes(booker)) {
        throw new Error('User already subscribed for this trip');
    }


    let tripRegistry = await getAssetRegistry('org.digitalpayment.Trip');

    // add participant to Trip
    tripParticipants.push(booker);

    // if maxParticipant is reached -> close trip booking
    if (tripParticipants.length === trip.maxParticipants) {
        trip.status = "CLOSE";
    }


    await tripRegistry.update(trip);

}
