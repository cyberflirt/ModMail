const fs = require("fs");
const path = require("path");
module.exports = {
	// ⚠️⚠️⚠️ Don't change this value!!! ⚠️⚠️⚠️
	name: "messageCreate",
	// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	disabled: false,
	once: false,
	async execute(param, message) {
		const { client, config, getEmbed, deployCommands } = param;
		const { author, content, channel, member } = message;
		const locale = param.locale[config.language];
		const configKeys = Object.keys(config);
		const separator = new RegExp("^(_Separator)\\s*");

		try {
			const mentionRegex = new RegExp(`^(<@!?${client.user.id}>)\\s*`);
			if (!mentionRegex.test(content)) return;

			const isOwner = author.id == config.ownerID;
			const isAdmin = member ? member.permissions.has("ADMINISTRATOR") : isOwner;
			const perm = isOwner || (config.ownerID == "-" && isAdmin);
			if (!perm) return;

			const [, matchedPrefix] = content.match(mentionRegex);
			const msgArgs = content.slice(matchedPrefix.length).trim().split(/ +/);
			const commandName = msgArgs.shift().toLowerCase();
			if (commandName == "deploy") {
				const isDeployed = await deployCommands.execute(param);
				return await channel.send({ content: isDeployed });
			}
			else if (commandName == "config") {
				const data = [];
				configKeys.forEach(key => {
					if (separator.test(key)) {
						const [, match] = key.match(separator);
						const clean = key.slice(match.length);
						data.push(`**[ ${clean} Config ]**`);
					}
					else {
						data.push(`🔹 ${key} : \`${config[key]}\``);
					}
				});
				return await channel.send({ content: data.join("\n") });
			}
			else if (commandName == "set") {
				const [configName, value] = msgArgs;
				const result = await param.set.config(param, locale, author, configName, value);
				let output;
				if (result.output == "invTarget") {
					output = "Invalid config name.";
				}
				else if (result.output == "invValue") {
					output = "Invalid value.";
				}
				else if (result.output == "noPerm") {
					output = "You have no permission to change this value.";
				}
				else if (result.output == "success") {
					output = `Successfully set ${configName} value to ${result.value}.`;
				}
				else if (result.output == "error") {
					output = "An error has occured.";
				}
				return await channel.send({ content: output });
			}
			else if (commandName == "reload") {
				const [target] = msgArgs;
				let getCommand, getFN, getLocale;
				// IK it looks ugly with the try and catch but whatever, my head hurt figuring it out.
				try {
					fs.accessSync(path.join(__dirname, "..", "locale", `${target}.js`));
					getLocale = true;
				}
				catch (error) {
					console.log("No locale");
				}
				try {
					fs.accessSync(path.join(__dirname, "..", "commands", `${target}.js`));
					getCommand = true;
				}
				catch (error) {
					console.log("No command");
				}
				try {
					fs.accessSync(path.join(__dirname, "..", "functions", `${target}.js`));
					getFN = true;
				}
				catch (error) {
					console.log("No function");
				}

				const data = [];
				if (!getCommand && !getFN && !getLocale) return await channel.send({ content: `Can't find ${target}.` });
				if (getLocale) {
					console.log(`> Deleting ${target} cache.`);
					delete require.cache[require.resolve(`../locale/${target}.js`)];

					console.log(`> Loading ${target}.`);
					param.locale[target] = require(`../locale/${target}.js`);
					data.push(`Reloaded \`${target}\` locale.`);
				}
				if (getCommand) {
					console.log(`> Deleting ${target} cache.`);
					delete require.cache[require.resolve(`../commands/${target}.js`)];

					console.log(`> Loading ${target}.`);
					const command = require(`../commands/${target}.js`);
					Object.keys(param.locale).forEach(key => {
						const currentLang = param.locale[key];
						const localeName = currentLang.commands[command.name].name;
						client.commands.set(localeName, command);
						console.log(`> Stored "${localeName}"[${command.name}] command to memory.`);
					});
					data.push(`Reloaded \`${target}\` command.`);
				}
				if (getFN) {
					console.log(`> Deleting ${target} cache.`);
					delete require.cache[require.resolve(`../functions/${target}.js`)];

					console.log(`> Loading ${target}.`);
					param[target] = require(`../functions/${target}.js`);
					data.push(`Reloaded \`${target}\` function.`);
				}
				return await channel.send({ content: data.join("\n") });
			}
			else if (commandName == "setup") {
				if (param.running) return;
				const cancel = "`Command canceled.`";
				const keys = ["mainServerID", "threadServerID", "categoryID", "logChannelID", "adminRoleID", "modRoleID", "mentionedRoleID"];
				let index = 0;
				let current = keys[index];
				let title = `Set "${locale.target[current]}" value`;
				let info = `**[ ${locale.target[current]} ]**\n${locale.commands.config.getInfo(current)}`;
				const footer = "Reply to answer • Type 'cancel' to quit • Timeout: 1m";
				let embed = await getEmbed.execute(param, "", config.infoColor, title, info, "", footer);
				const botMessage = await message.reply({ embeds: [embed] });
				const filter = response => {
					return response.reference?.messageId == botMessage.id && response.author.id === message.author.id;
				};
				const waitMsg = async function() {
					param.running = true;
					message.channel.awaitMessages({ filter, max: 1, time: 60000, errors: ["time"] })
						.then(async collected => {
							const userMsg = collected.first();
							const userReply = userMsg.content.toLowerCase();
							if (userReply == "cancel") {
								param.running = false;
								if (userMsg.deletable) await userMsg.delete();
								return await botMessage.edit({ content: cancel, embeds: [] });
							}
							if (index == keys.length - 1) {
								param.running = false;
								const output = await param.deployCommands.execute(param);
								if (userMsg.deletable) await userMsg.delete();
								return await botMessage.edit({ content: output, embeds: [] });
							}

							const output = await param.set.config(param, locale, author, current, userReply);
							if (output == locale.value.invalid) {
								embed = await getEmbed.execute(param, "", config.infoColor, title, `${info}\n\n⚠️ ${output}`, "", footer);
								await botMessage.edit({ embeds: [embed] });
								await userMsg.delete().catch(() => {return});
								return waitMsg();
							}
							else {
								index++;
								current = keys[index];
								title = `Set "${locale.target[current]}" value.`;
								info = `**[ ${locale.target[current]} ]**\n${locale.commands.config.getInfo(current)}`;
								embed = await getEmbed.execute(param, "", config.infoColor, title, info, "", footer);
								await botMessage.edit({ embeds: [embed] });
								if (userMsg.deletable) await userMsg.delete();
								return waitMsg();
							}
						})
						.catch(async () => {
							param.running = false;
							return await botMessage.edit({ content: "`Timeout.`", embeds: [] });
						});
				};
				await waitMsg();
			}
			else {
				return;
			}
		}
		catch (error) {
			console.log(error);
		}
	},
};
