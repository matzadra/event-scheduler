import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan } from 'typeorm';
import { Event } from '../entities/event.entity';
import { User } from '../entities/user.entity';
import { EventParticipant } from '../entities/event-participant.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventRepository: Repository<Event>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EventParticipant)
    private readonly eventParticipantRepository: Repository<EventParticipant>,
  ) {}

  async createEvent(
    description: string,
    startTime: Date,
    endTime: Date,
    userId: string,
  ) {
    if (startTime >= endTime) {
      throw new BadRequestException('Start time must be earlier than end time');
    }
    const overlappingEvent = await this.eventRepository.findOne({
      where: [
        { owner: { id: userId }, startTime: Between(startTime, endTime) },
        { owner: { id: userId }, endTime: Between(startTime, endTime) },
        {
          owner: { id: userId },
          startTime: LessThan(startTime),
          endTime: MoreThan(endTime),
        },
      ],
    });

    if (overlappingEvent) {
      if (startTime.getTime() === overlappingEvent.endTime.getTime()) {
        throw new BadRequestException('Events cannot be consecutive');
      }
      throw new BadRequestException('Event overlaps with an existing event');
    }

    // Check if user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Create and save new event
    const newEvent = this.eventRepository.create({
      description,
      startTime,
      endTime,
      owner: user,
    });

    return this.eventRepository.save(newEvent);
  }

  async inviteUser(eventId: string, userId: string) {
    const event = await this.eventRepository.findOne({
      where: { id: eventId },
      relations: ['owner'],
    });
    if (!event) throw new NotFoundException('Event not found');
    if (event.owner.id === userId)
      throw new BadRequestException('Cannot invite yourself');

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const invitation = this.eventParticipantRepository.create({
      event,
      user,
      status: 'pending',
    });
    return this.eventParticipantRepository.save(invitation);
  }

  async updateInviteStatus(
    eventId: string,
    inviteId: string,
    status: 'accepted' | 'rejected',
  ) {
    const invitation = await this.eventParticipantRepository.findOne({
      where: { id: inviteId, event: { id: eventId } },
      relations: ['event', 'user'],
    });
    if (!invitation) throw new NotFoundException('Invitation not found');

    invitation.status = status;
    return this.eventParticipantRepository.save(invitation);
  }

  async getEventParticipants(eventId: string) {
    const participants = await this.eventParticipantRepository.find({
      where: { event: { id: eventId }, status: 'accepted' },
      relations: ['user'],
    });
    return participants.map((p) => ({
      id: p.user.id,
      name: p.user.name,
      email: p.user.email,
    }));
  }

  async getEventsByUser(userId: string) {
    return this.eventRepository.find({
      where: { owner: { id: userId } },
      relations: ['owner'],
      select: {
        owner: {
          id: true,
          name: true,
          email: true,
        },
      },
    });
  }
}
