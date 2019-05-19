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
 * BuyLotteryTicket
 * @param {org.digitalpayment.BuyLotteryTicket} transactionRequest
 * @transaction
 */
async function BuyLotteryTicket(transactionRequest) {
    // TODO gestire permessi

    let ticketDetails = transactionRequest.ticketDetails;
    let ticketRegistry = await getAssetRegistry('org.digitalpayment.LotteryTicket');
    let factory = await getFactory();
    let ticket = await factory.newResource('org.digitalpayment', 'LotteryTicket', ticketDetails.ticketId);
    let lottery = transactionRequest.lottery;
    let ticketOwner = transactionRequest.ticketOwner;

    ticket.lottery = lottery;
    ticket.ticketOwner = ticketOwner.owner;
    ticket.price = lottery.price;


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
    for (i = 0; i < lotteryTickets.length; i++) {
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
 * DrawLottery
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
 * BookTrip
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


/**
 * BookBeachUmbrella
 * @param {org.digitalpayment.BookBeachUmbrella} transactionRequest
 * @transaction
 */
async function BookBeachUmbrella(transactionRequest) {
    // I assume that the application will show disponibilities

    var beach = transactionRequest.beach;
    var beachUmbrella = transactionRequest.beachUmbrella;
    var customer = transactionRequest.customer;
    var startDate = transactionRequest.startDate;
    var endDate = transactionRequest.endDate;
    var reservationDetails = transactionRequest.reservationDetails;
    var reservations = beachUmbrella.reservations;

    // check dates
    if (reservations.length != 0) {
        for (i = 0; i < reservations.length; i++) {
            if (startDate.getTime() === reservations[i].startDate.getTime() || startDate.getTime() === reservations[i].endDate.getTime()) {
                throw new Error("Dates not valid");
            }
            if (endDate.getTime() === reservations[i].startDate.getTime() || endDate.getTime() === reservations[i].endDate.getTime()) {
                throw new Error("Dates not valid");
            }
            if (startDate > reservations[i].startDate && startDate < reservations[i].endDate) {
                throw new Error("Dates not valid");
            }
            if (endDate > reservations[i].startDate && endDate < reservations[i].endDate) {
                throw new Error("Dates not valid");
            }
        }
    }

    // calculate days between dates
    var oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
    var diffDays = Math.round(Math.abs((startDate.getTime() - endDate.getTime()) / (oneDay)));
    var days = diffDays + 1;


    // buld new reservation
    let reservationsRegistry = await getAssetRegistry('org.digitalpayment.BeachUmbrellaReservation');
    let factory = await getFactory();
    let reservation = await factory.newResource('org.digitalpayment', 'BeachUmbrellaReservation', reservationDetails.reservationId);

    reservation.beach = beach;
    reservation.beachUmbrella = beachUmbrella;
    reservation.customer = customer;
    reservation.startDate = startDate;
    reservation.endDate = endDate;
    reservation.days = days;

    // create new reservation instance
    await reservationsRegistry.add(reservation);

    // add the new reservation in the Beach Umbrella reservations array
    reservations.push(reservation);

    let beachUmbrellaRegistry = await getAssetRegistry('org.digitalpayment.BeachUmbrella');
    await beachUmbrellaRegistry.update(beachUmbrella);
}
/********************************************************
 * 
 * 
 * 
 * 
 * 
 * 
 * 
 * ***************** */

/**
 * BookRestaurant
 * @param {org.digitalpayment.BookRestaurant} transactionRequest
 * @transaction
 */
async function BookRestaurant(transactionRequest) {
    // I assume that the application will show disponibilities

    var restaurant = transactionRequest.restaurant;
    var reservationDetails = transactionRequest.reservationDetails;
    var seats = transactionRequest.seats;
    // TODO check if seats == 0

    var date = transactionRequest.date;

    var dailyReservations = restaurant.dailyReservations;

    // buld new reservation
    let reservationsRegistry = await getAssetRegistry('org.digitalpayment.RestaurantReservation');
    let factory = await getFactory();
    var reservation = await factory.newResource('org.digitalpayment', 'RestaurantReservation', reservationDetails.reservationId);


    reservation.restaurant = restaurant;
    reservation.seats = seats;
    reservation.date = date;

    // create new reservation instance
    await reservationsRegistry.add(reservation);


    // add the new reservation in dailyReservations

    var dayExist = false;

    if (dailyReservations.length > 0) {
        for (i = 0; i < dailyReservations.length; i++) {

            // check if an instance with this date already exist
            if (dailyReservations[i].date.getTime() === date.getTime()) {

                // check if there are enough seats available
                if (dailyReservations[i].availableSeats >= seats) {
                    dailyReservations[i].availableSeats -= seats;
                    dailyReservations[i].reservations.push(reservation);
                    dayExist = true;
                    break;
                } else {
                    throw new Error('Sold out.');
                }

            }
        }
    }



    if (!dayExist) {
        // create new instance and set data       

        //  TODO data + ristoranteId
        let day_id = restaurant.restaurantId + reservationDetails.reservationId;
        let dailyReservationsRegistry = await getAssetRegistry('org.digitalpayment.DailyReservations');

        // TODO sistemare questo id
        let day = await factory.newResource('org.digitalpayment', 'DailyReservations', day_id);
        day.date = date;
        day.restaurant = restaurant;
        day.availableSeats = restaurant.totalSeats;

        if (day.availableSeats < seats) {
            throw new Error('Sold out.');
        }
        day.availableSeats -= seats;
        day.reservations = [];
        day.reservations.push(reservation);
        dailyReservations.push(day);
        await dailyReservationsRegistry.add(day);
    }

    let restaurantRegistry = await getAssetRegistry('org.digitalpayment.Restaurant');

    await restaurantRegistry.update(restaurant);





}



