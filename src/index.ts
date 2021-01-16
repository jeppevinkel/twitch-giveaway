import TwitchJS from 'twitch-js';
import { RefreshableAuthProvider, StaticAuthProvider } from 'twitch-auth';
import { promises as fs } from 'fs';
import * as Config from './config.json';
import Giveaways from './giveaways.json';
import {stringify} from "querystring";

const loggerOptions = {
    level: "warn"
};

const activeGiveaways: Map<string, string[]> = new Map<string, string[]>();
const winnerMessages: string[] = [];

const run = async () => {
    const tokenData = JSON.parse(await fs.readFile('./tokens.json', 'utf-8'));
    const authProvider = new RefreshableAuthProvider(
        new StaticAuthProvider(Config.clientId, tokenData.accessToken),
        {
            clientSecret: Config.clientSecret,
            refreshToken: tokenData.refreshToken,
            expiry: tokenData.expiryTimestamp === null ? null : new Date(tokenData.expiryTimestamp),
            onRefresh: async ({ accessToken, refreshToken, expiryDate }) => {
                const newTokenData = {
                    accessToken,
                    refreshToken,
                    expiryTimestamp: expiryDate === null ? null : expiryDate.getTime()
                };
                await fs.writeFile('./tokens.json', JSON.stringify(newTokenData, null, 4), 'utf-8')
            }
        }
    );

    const onAuthenticationFailure = () => authProvider.refresh().then(token => token.accessToken);

    const chat = new TwitchJS.Chat({
        log: loggerOptions,
        username: Config.clientUsername,
        token: tokenData.accessToken,
        onAuthenticationFailure
    });
    await chat.connect();

    await chat.join(Config.channel);

    await chat.me(Config.channel, "casually enters the chat...");

    chat.on('PRIVMSG', data => {
        if (!data.message) return;

        // for (let i = 0; i < Giveaways.length; i++) {
        Giveaways.forEach(giveaway => {
            if (data.message == giveaway.keyword) {
                if (!giveaway.activated) {
                    giveaway.activated = true;
                    setTimeout(endGiveaway, giveaway.giveawayTime * 1000, giveaway);
                }
                let giveawayUsers = (activeGiveaways.get(giveaway.keyword) ? activeGiveaways.get(giveaway.keyword) : []);
                if (!giveawayUsers || giveawayUsers.includes(data.username)) return;
                giveawayUsers.push(data.username);
                activeGiveaways.set(giveaway.keyword, giveawayUsers);
            }
        });

        console.log(activeGiveaways);
    });

    chat.on('WHISPER', data => {
        console.log(`(whisper) ${data.tags.displayName}: ${data.message}`);
    })

    function endGiveaway(giveaway: {keyword: string, winnerMessages: string[], giveawayTime: number, activated: boolean}) {
        Giveaways.splice(Giveaways.indexOf(giveaway), 1);
        console.log("Ending giveaway " + giveaway.keyword);

        let users = activeGiveaways.get(giveaway.keyword) ? activeGiveaways.get(giveaway.keyword) : [];
        if (!users) return;

        let rewards = giveaway.winnerMessages.length;
        let winners: string[] = [];

        while (rewards > 0 && users.length > 0) {
            let i = Math.floor(Math.random() * users.length);
            winners.push(users[i]);
            users.splice(i, 1);
            rewards--;
        }

        chat.say(Config.channel, "The winner(s) are " + winners.join(" and ") + "!");

        for (let i = 0; i < winners.length; i++) {
            console.log("Sending message to winner. (" + winners[i] + "): " + giveaway.winnerMessages[i]);
            winnerMessages.push(winners[i] + ": " + giveaway.winnerMessages[i]);
            chat.send(`PRIVMSG jtv :/w ${winners[i]} ${giveaway.winnerMessages[i]}`);
        }

        fs.writeFile('./winners.json', JSON.stringify(winnerMessages, null, 4), 'utf-8');

        activeGiveaways.delete(giveaway.keyword);
    }
}

run().catch(e => {
    console.log(e);
})