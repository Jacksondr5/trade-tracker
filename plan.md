Feature list:

- The ability to create campaigns to capture bigger picture ideas
  - Things like precious metal bull run, pick up and manufacturing, US currency devaluation All of these are big picture items that I can get exposure to through multiple trade ideas. For example, a pick up on industrials is related to base metals, industrial stocks, transportation stocks.
  - The goal here is to give me a place to put scratch that the goal here is to give me a place to capture thoughts and updates on larger macroeconomic or larger market trends. It will also let me group together trades that are related so I can better manage my exposure to certain themes.
- Trade plans should capture my plans for a specific instrument like an individual stock or ETF. I want to be able to capture an overall mini thesis for the trade link it to a campaign set entry and exit conditions and then take notes as it develops.
  - The main thing here is being able to keep track of my thoughts prior to entering a trade. Secondarily I want to be able to make sure that I maintain my plan throughout the execution of the trade. The trade plan will have multiple trades in it - entries, profit-taking, risk reduction, exits, increase exposure.

I think I want the trade itself to be data that just comes from my brokerages. I don't want to manually enter in trades. The primary point of this app is to take notes on my thoughts and to keep me honest and give me room to breathe when I don't have to remember all these things. It puts time pressure on me or I will forget key details about why I'm looking at a particular instrument. So the MVP really needs to capture the campaigns and the trade plans. It will be useful to me even if I cannot track trades at all because I can do a decent job of seeing the trades via charts.

V2 should definitely include trade capabilities - mainly pulling from the brokerages. This will become a lot more valuable and let me keep track of things long term. Some other features that I need to prioritize include:

- Analytics - need to be able to tell things like profit/loss, win/loss ratio, comparison to various benchmarks
- Automatic trade execution - there may be a case where I can't set a stop-loss exactly how I want to (mainly on break of a trend line). This would give me a way to automate exiting a position in certain cases. I need to think more about this though because it's pretty poorly defined requirement
- Alerts - not necessarily sending me a notification but bringing my attention (likely on dashboard) if a certain trade is close to its stop-loss or close to some kind of other exit condition (any exit condition other than stop-loss)

TODO:

1. Add trades
2. Have data be tied to a count so that people that log in can only see their trades.

---

Several items to improve:

1. It is not actually implementing the connector. We probably need to solve that more directly inside of the architecture because the agent is not able to figure out what to do on its own when it spawned to do the cutting.
   - I think if I give it OpenAPI specs or pre-implement a client, that it will be able to do most of the stuff here. I just need to make sure that whatever client library I use has the ability to hook in so we can deal with IBKR's complexities.
2. It's not using Convex very well. It's doing a lot of very strange things that I don't think fit the Convex way of doing things. We might need to make a special Convex agent that feels somewhat like an anti-pattern, but I don't know of a better way to get an understanding of Convex and allow it to get feedback from Convex.
3. We should look into different ways to parallelize while the Ralph approach to break things down into different tasks is certainly very good. Nicholas's idea of splitting the tasks between two different sets of agents, one for UI and one for other things is probably good and should be done. I need to look into what other options there are around doing that, and see what Pete's doing.
4. There's connectors in the convex and lib folders. They should not be in two places. We're going to need the connector to run on both the Convex backend and the Next.js backend, so I need to figure out what the right way to share code between those is. I'm pretty sure I could just import it from a lib folder, but I don't know if Convex has some weird issue with that.

I need to go back and fix the design and the architecture, including more information about the connection to the backend APIs, and then split that out into a bunch of Ralph tasks. I probably need to be very specific on how to validate the Convex stuff.

Different verticals:

1. Connecting to brokerages. This includes establishing the connection, testing the connection, and then is used by the trade pullers, both the cron job and the backfill process. We need to establish the actions that the connector needs to be able to do (get auth token, get trades, etc.) and set up a basic interface for the connector to be able to do those things.
2. Pulling trades (cron, manual sync). Should put in an inbox that the user can review and then assign the trade to a campaign or plan. Will need to be able to dedupe the trades and then insert new into DB.
3. Pulling historical trades (backfill). This should be able to pull all the trades from a given start date to the current date. Builds on pulling trades, essentially feeds more trades into that system.
4. The engine to match the trades and get feedback from the user to assign the trade to a campaign or plan.
