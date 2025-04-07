import {
    IAppAccessors,
    IConfigurationExtend,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo, RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';

// define dataset
interface Dataset {
    id: string;
    description?: string;
    lastModified?: string;
}

// Association Watch List
const WATCH_LIST_ASSOCIATION = new RocketChatAssociationRecord(
    RocketChatAssociationModel.MISC,
    'dataset-watch-list'
);

// list dataset command
class DatasetListCommand implements ISlashCommand {
    public command = 'datasets';
    public i18nDescription = 'List available datasets from Hugging Face';
    public i18nParamsExample = '';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        try {
            const datasets = await fetch(
                "https://huggingface.co/api/datasets?search=test-dataset&author=ryua22222&limit=5&full=true",
                {
                    method: "GET",
                    headers: {"Authorization":"Bearer <huggingface token>"}
                }
            );

            let messageText = '🤗 *Hugging Face Datasets*\n\n';
            const datasetsData = await datasets.json();
            
            if (Array.isArray(datasetsData)) {
                datasetsData.forEach((dataset, index) => {
                    messageText += `${index + 1}. *${dataset.id}*\n`;
                    messageText += `   Description: ${dataset.description || 'N/A'}\n`;
                    messageText += `   Last modified: ${dataset.lastModified || 'N/A'}\n`;
                    messageText += `   To watch this dataset, use: \`/watch ${dataset.id}\`\n\n`;
                });
            } else {
                messageText += 'No datasets found or unexpected response format.';
            }

            messageText += '\n_Showing datasets from Hugging Face_';

            const msg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText(messageText);
            
            await modify.getCreator().finish(msg);

        } catch (error) {
            const errorMsg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText('❌ Error: Unable to fetch datasets from Hugging Face. Please try again later.');
            
            await modify.getCreator().finish(errorMsg);
        }
    }
}

// Watch List command
class WatchAddCommand implements ISlashCommand {
    public command = 'watch';
    public i18nDescription = 'Add a dataset to your watch list';
    public i18nParamsExample = '<dataset_id>';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        const datasetId = context.getArguments()[0];
        
        if (!datasetId) {
            const errorMsg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText('❌ Please provide a dataset ID to watch');
            
            await modify.getCreator().finish(errorMsg);
            return;
        }

        try {
            // current watch list
            const records = await read.getPersistenceReader().readByAssociation(WATCH_LIST_ASSOCIATION);
            const watchList = records.length > 0 ? records[0] as { datasets: string[] } : { datasets: [] };

            // check dataset is exist
            if (watchList.datasets.includes(datasetId)) {
                const msg = modify.getCreator().startMessage()
                    .setSender(context.getSender())
                    .setRoom(context.getRoom())
                    .setText(`📌 Dataset *${datasetId}* is already in your watch list`);
                
                await modify.getCreator().finish(msg);
                return;
            }

            // add dataset
            watchList.datasets.push(datasetId);
            await persis.updateByAssociation(WATCH_LIST_ASSOCIATION, watchList, true);

            const successMsg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText(`✅ Added *${datasetId}* to your watch list`);
            
            await modify.getCreator().finish(successMsg);

        } catch (error) {
            const errorMsg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText('❌ Error: Unable to update watch list');
            
            await modify.getCreator().finish(errorMsg);
        }
    }
}

class WatchListCommand implements ISlashCommand {
    public command = 'watchlist';
    public i18nDescription = 'Show your watched datasets';
    public i18nParamsExample = '';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence
    ): Promise<void> {
        try {
            // get Watch List
            const records = await read.getPersistenceReader().readByAssociation(WATCH_LIST_ASSOCIATION);
            const watchList = records.length > 0 ? records[0] as { datasets: string[] } : { datasets: [] };

            if (watchList.datasets.length === 0) {
                const msg = modify.getCreator().startMessage()
                    .setSender(context.getSender())
                    .setRoom(context.getRoom())
                    .setText('📝 Your watch list is empty. Use `/watch <dataset_id>` to add datasets.');
                
                await modify.getCreator().finish(msg);
                return;
            }

            // get details of dataset in Watch List
            let messageText = '📋 *Your Watched Datasets*\n\n';

            for (let i = 0; i < watchList.datasets.length; i++) {
                const datasetId = watchList.datasets[i];
                try {
                    const response = await fetch(
                        `https://huggingface.co/api/datasets/${datasetId}`,
                        {
                            method: "GET",
                            headers: {"Authorization":"Bearer <hf_access_token>"}
                        }
                    );

                    if (response.ok) {
                        const dataset = await response.json();
                        messageText += `${i + 1}. *${dataset.id}*\n`;
                        messageText += `   Description: ${dataset.description || 'N/A'}\n`;
                        messageText += `   Last modified: ${dataset.lastModified || 'N/A'}\n`;
                        messageText += `   Downloads: ${dataset.downloads || 'N/A'}\n\n`;
                    } else {
                        messageText += `${i + 1}. *${datasetId}* (Unable to fetch details)\n\n`;
                    }
                } catch (error) {
                    messageText += `${i + 1}. *${datasetId}* (Error fetching details)\n\n`;
                }
            }

            messageText += '_To remove a dataset from your watch list, use_ `/unwatch <dataset_id>`';

            const msg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText(messageText);
            
            await modify.getCreator().finish(msg);

        } catch (error) {
            const errorMsg = modify.getCreator().startMessage()
                .setSender(context.getSender())
                .setRoom(context.getRoom())
                .setText('❌ Error: Unable to fetch your watch list');
            
            await modify.getCreator().finish(errorMsg);
        }
    }
}


export class KuraryuHuggingfaceApp extends App {
    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {
        await configuration.slashCommands.provideSlashCommand(new DatasetListCommand());
        await configuration.slashCommands.provideSlashCommand(new WatchAddCommand());
        await configuration.slashCommands.provideSlashCommand(new WatchListCommand());
    }
}