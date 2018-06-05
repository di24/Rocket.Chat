let pageVisitedCollection;
let messageCollection;

const roomIdByToken = {};

const batchSize = 2000;

async function migrateHistory(total, current) {
	console.log(`Livechat history migration ${ current }/${ total }`);

	const items = await pageVisitedCollection.find({}).limit(batchSize).toArray();

	const actions = items.reduce((result, item) => {
		if (typeof roomIdByToken[item.token] === 'undefined') {
			const rooms = RocketChat.models.Rooms.findByVisitorToken(item.token).fetch();
			roomIdByToken[item.token] = rooms && rooms.length > 0 ? rooms[0]._id : null;
		}
		if (roomIdByToken[item.token]) {
			const msg = {
				t: 'livechat_navigation_history',
				rid: roomIdByToken[item.token],
				ts: item.ts,
				msg: `${ item.page.title } - ${ item.page.location.href }`,
				u: {
					_id : 'rocket.cat',
					username : 'rocket.cat'
				},
				groupable : false,
				navigation : {
					page: item.page,
					token: item.token
				}
			};
			result.insert.push(msg);
		}
		result.remove.push(item._id);

		return result;
	}, { insert: [], remove: [] });

	const batch = Promise.all([
		messageCollection.insertMany(actions.insert),
		pageVisitedCollection.removeMany({ _id: { $in: actions.remove } })
	]);
	if (actions.remove.length === batchSize) {
		await batch;
		return migrateHistory(total, current + batchSize);
	}

	return batch;
}


RocketChat.Migrations.add({
	version: 123,
	up() {
		pageVisitedCollection = RocketChat.models.LivechatPageVisited.model.rawCollection();
		messageCollection = RocketChat.models.Messages.model.rawCollection();

		/*
		 * Move visitor navigation history to messages
		 */
		Meteor.setTimeout(async() => {
			const pages = pageVisitedCollection.find({});
			const total = await pages.count();
			await pages.close();

			console.log('Migrating livechat visitors navigation history to livechat messages. This might take a long time ...');

			await migrateHistory(total, 0);

			console.log('Livechat visitors navigation history migration finished.');
		}, 1000);
	}
});
