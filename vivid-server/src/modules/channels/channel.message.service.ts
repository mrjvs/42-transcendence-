import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DeleteResult, Repository } from 'typeorm';
import { Observable, from } from 'rxjs';
import {
  MessageEntity,
  IMessage,
  IMessageInput,
  PaginationDto,
} from '@/messages.entity';
import { EventGateway } from '$/websocket/event.gateway';
import { ChannelService } from './channel.service';
import { UserEntity } from '@/user.entity';
import { ChannelTypes } from '~/models/channel.entity';
import { FriendsService } from '../friends/friends.service';

@Injectable()
export class ChannelMessageService {
  constructor(
    @InjectRepository(MessageEntity)
    private MessageRepository: Repository<MessageEntity>,
    private readonly eventGateway: EventGateway,
    private readonly channelService: ChannelService,
    private readonly friendService: FriendsService,
  ) {}

  async postMessage(
    user: UserEntity,
    messageInput: IMessageInput,
  ): Promise<IMessage> {
    const channel = await this.channelService.findChannel(
      messageInput.channel,
      false,
      null,
    );
    if (!channel) throw new NotFoundException();

    // if dm channel, check if actual friends, throw forbidden if not
    if (channel.type == ChannelTypes.DM) {
      const friendId = channel.dmId.split('=').find((v) => v != user.id);
      const friendship = await this.friendService.getFriend(user.id, friendId);
      if (!friendship || !friendship.accepted) throw new ForbiddenException();
    }

    const result = await this.MessageRepository.save(messageInput);
    this.eventGateway.sendChannelMessage(result, channel.joined_users, user);
    return result;
  }

  getMessages(
    id: string,
    paginationDto?: PaginationDto,
  ): Observable<MessageEntity[]> {
    if (!paginationDto) {
      return from(
        this.MessageRepository.find({
          where: {
            channel: id,
          },
          order: {
            created_at: 'ASC',
          },
        }),
      );
    }
    return from(
      this.MessageRepository.find({
        where: {
          channel: id,
          created_at: Between(paginationDto.date1, paginationDto.date2),
        },
        order: {
          created_at: 'ASC',
        },
      }),
    );
  }

  async getMessage(
    channelId: string,
    messageId: string,
  ): Promise<MessageEntity> {
    return await this.MessageRepository.findOne({
      where: { channel: channelId, id: messageId },
    });
  }

  async deleteMessage(
    channelId: string,
    messageId: string,
    userId?: string,
  ): Promise<{ id: string }> {
    let builder: any = this.MessageRepository.createQueryBuilder();
    builder = builder
      .delete()
      .where('channel = :channelId', { channelId: channelId })
      .andWhere('id = :messageId', { messageId: messageId });

    if (userId) {
      builder = builder.andWhere('user = :owner', { owner: userId });
    }

    const result: DeleteResult = await builder.execute();
    if (result.affected !== 1) throw new NotFoundException();

    const channel = await this.channelService.findChannel(channelId, false);
    if (!channel) throw new NotFoundException();

    this.eventGateway.deleteChannelMessage(
      channelId,
      channel.joined_users,
      messageId,
    );
    return { id: messageId };
  }
}
