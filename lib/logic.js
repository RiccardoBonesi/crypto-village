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

// ***********************************************

//                 LOTTERY


// ***********************************************

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
    lottery.participants += 1;

    if(lottery.maxParticipants === lottery.participants) {
        lottery.status = "CLOSE";
    }

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


// ***********************************************

//                 TRIP


// ***********************************************


/**
 * BookTrip
 * @param {org.digitalpayment.BookTrip} transactionRequest
 * @transaction
 */
async function BookTrip(transactionRequest) {

    var trip = transactionRequest.trip;
    var booker = transactionRequest.booker;

    if (trip.status !== "OPEN") {
        throw new Error("Maximum participants reached");
    }

    var tripParticipants = trip.participants;

    if (tripParticipants.includes(booker)) {
        throw new Error('User already subscribed for this trip');
    }


    let tripRegistry = await getAssetRegistry('org.digitalpayment.Trip');

    // add participant to Trip
    tripParticipants.push(booker);

    trip.currentParticipants += 1;

    if (trip.currentParticipants === trip.maxParticipants) {
        trip.status = "CLOSE";
    }


    await tripRegistry.update(trip);
}

/**
 * DeleteTripReservation
 * @param {org.digitalpayment.DeleteTripReservation} transactionRequest
 * @transaction
 */
async function DeleteTripReservation(transactionRequest) {

    var trip = transactionRequest.trip;
    var customer = transactionRequest.customer;

    if (trip.status !== "OPEN") {
        throw new Error('Impossible to delete reservation.');
    }

    var tripParticipants = trip.participants;

    var reservationexist = false;

    for (i = 0; i < tripParticipants.length; i++) {
        if (tripParticipants[i].customerId === customer.customerId) {
            tripParticipants.splice(i, 1);
            trip.currentParticipants -= 1;
            reservationexist = true;
        }
    }

    if (!reservationexist) {
        throw new Error('Reservation does not exist');
    }

    let tripRegistry = await getAssetRegistry('org.digitalpayment.Trip');

    await tripRegistry.update(trip);
}

// ***********************************************

//                 BEACH UMBRELLA


// ***********************************************

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
            if (startDate < reservations[i].startDate && reservations[i].startDate < endDate) {
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

/**
 * DeleteUmbrellaReservation
 * @param {org.digitalpayment.DeleteUmbrellaReservation} transactionRequest
 * @transaction
 */
async function DeleteUmbrellaReservation(transactionRequest) {

    var beachUmbrella = transactionRequest.beachUmbrella;
    var customer = transactionRequest.customer;
    var startDate = transactionRequest.startDate;
    var endDate = transactionRequest.endDate;

    var reservations = beachUmbrella.reservations;
    var reservationExist = false;

    for (i = 0; i < reservations.length; i++) {
        if (reservations[i].customer.customerId === customer.customerId) {
            if (reservations[i].startDate.getTime() === startDate.getTime() &&
                reservations[i].endDate.getTime() === endDate.getTime()) {
                reservations.splice(i, 1); // remove reservation from array
                reservationExist = true;
            }

        }
    }

    if (!reservationExist) {
        throw new Error("Reservation does not exist");
    }

    let beachUmbrellaRegistry = await getAssetRegistry('org.digitalpayment.BeachUmbrella');
    await beachUmbrellaRegistry.update(beachUmbrella);

}


// ***********************************************

//                 RESTAURANT


// ***********************************************

/**
 * BookRestaurant
 * @param {org.digitalpayment.BookRestaurant} transactionRequest
 * @transaction
 */
async function BookRestaurant(transactionRequest) {
    // I assume that the application will show disponibilities   

    var restaurant = transactionRequest.restaurant;
    var reservationDetails = transactionRequest.reservationDetails;
    var customer = transactionRequest.customer;
    var seats = transactionRequest.seats;

    if (seats <= 0) {
        throw new Error('Seats can not be zero or negative');
    }

    var date = transactionRequest.date;

    var dailyReservations = restaurant.dailyReservations;

    // buld new reservation
    let reservationsRegistry = await getAssetRegistry('org.digitalpayment.RestaurantReservation');
    let factory = await getFactory();
    var reservation = await factory.newResource('org.digitalpayment', 'RestaurantReservation', reservationDetails.reservationId);
    var dailyReservationsRegistry = await getAssetRegistry('org.digitalpayment.DailyReservations');


    reservation.restaurant = restaurant;
    reservation.seats = seats;
    reservation.date = date;
    reservation.customer = customer;

    // create new reservation instance
    await reservationsRegistry.add(reservation);


    // add the new reservation in dailyReservations

    var dayExist = false;

    if (dailyReservations.length > 0) {
        for (i = 0; i < dailyReservations.length; i++) {

            // check if an instance with this date already exist
            if (dailyReservations[i].date.getTime() === date.getTime()) {

                // a customer can made only a reservation per day
                for (j = 0; j < dailyReservations[i].reservations.length; j++) {
                    if (dailyReservations[i].reservations[j].customer.customerId === customer.customerId) {
                        throw new Error('Customers can make only a reservation per day');
                    }
                }

                // check if there are enough seats available
                if (dailyReservations[i].availableSeats >= seats) {
                    dailyReservations[i].availableSeats -= seats;
                    dailyReservations[i].reservations.push(reservation);
                    dayExist = true;
                    await dailyReservationsRegistry.update(dailyReservations[i]);
                    break;
                } else {
                    throw new Error('Sold out.');
                }

            }
        }
    }


    if (!dayExist) {
        // create new instance and set data 

        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day_date = date.getDate();

        let day_id = "" + year + month + day_date + "-" + restaurant.restaurantId;

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


/**
 * DeleteRestaurantReservation
 * @param {org.digitalpayment.DeleteRestaurantReservation} transactionRequest
 * @transaction
 */
async function DeleteRestaurantReservation(transactionRequest) {

    var customer = transactionRequest.customer;
    var restaurant = transactionRequest.restaurant;
    var date = transactionRequest.date;

    var dailyReservations = restaurant.dailyReservations;

    var dailyReservationsRegistry = await getAssetRegistry('org.digitalpayment.DailyReservations');


    var reservationExist = false;

    for (i = 0; i < dailyReservations.length; i++) {
        if (dailyReservations[i].date.getTime() === date.getTime()) {

            for (j = 0; j < dailyReservations[i].reservations.length; j++) {

                if (dailyReservations[i].reservations[j].customer.customerId === customer.customerId) {

                    // recalculate available seats
                    dailyReservations[i].availableSeats += dailyReservations[i].reservations[j].seats;

                    dailyReservations[i].reservations.splice(j, 1);  // remove reservation                    
                    await dailyReservationsRegistry.update(dailyReservations[i]);
                    reservationExist = true;
                }

            }

        }
    }

    if (!reservationExist) {
        throw new Error("Reservation does not exist");
    }


    let restaurantRegistry = await getAssetRegistry('org.digitalpayment.Restaurant');

    await restaurantRegistry.update(restaurant);

}






// TODO:
/*
 - transazione per aggiungere beach umbrella a beach (solo admin)
 - query che ritorna le prenotazioni di oggi
 - gestire prenotazione ristoranti pranzo/cena
*/

