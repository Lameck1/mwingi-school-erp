import { container } from '../../services/base/ServiceContainer';
import { MessageService } from '../../services/MessageService';
import { ROLES } from '../ipc-result';
import {
    MessageGetTemplatesSchema,
    MessageSaveTemplateSchema,
    MessageSendSmsSchema,
    MessageSendEmailSchema,
    MessageGetLogsSchema
} from '../schemas/message-schemas';
import { validatedHandler } from '../validated-handler';

const svc = () => new MessageService();

export function registerMessageHandlers(): void {
    validatedHandler('message:getTemplates', ROLES.STAFF, MessageGetTemplatesSchema, () => {
        return svc().getTemplates();
    });

    validatedHandler('message:saveTemplate', ROLES.MANAGEMENT, MessageSaveTemplateSchema, (_event, template) => {
        return svc().saveTemplate(template);
    });

    validatedHandler('message:sendSms', ROLES.STAFF, MessageSendSmsSchema, (_event, options, actor) => {
        return svc().sendSms({ ...options, userId: actor.id });
    });

    validatedHandler('message:sendEmail', ROLES.STAFF, MessageSendEmailSchema, async (event, options, actor) => {
        const service = container.resolve('NotificationService');
        const recipientType = (options.recipientType ?? 'GUARDIAN') as 'STUDENT' | 'STAFF' | 'GUARDIAN';
        return await service.send({
            recipientType,
            recipientId: options.recipientId || 0,
            channel: 'EMAIL',
            to: options.to,
            subject: options.subject,
            message: options.body
        }, actor.id);
    });

    validatedHandler('message:getLogs', ROLES.STAFF, MessageGetLogsSchema, (_event, [limit]) => {
        return svc().getLogs(limit || 50);
    });
}
