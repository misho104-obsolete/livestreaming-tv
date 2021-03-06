require 'json'
require 'sinatra'
require 'twitter'
require 'tempfile'
require 'yaml'
require 'active_support'
require 'time'

module LiveStreamingTV
  class Controller < Sinatra::Base
    configure do
      disable :protection
      set :config, YAML::load_file('config/config.yaml')
      set :controller, BonDriverController.new(settings.config)
      set :database, ActiveRecord::Base.establish_connection(YAML::load_file('config/database.yaml'))

      client = Twitter::REST::Client.new do |config|
        config.consumer_key        = ENV['CONSUMER_KEY']
        config.consumer_secret     = ENV['CONSUMER_SECRET']
        config.access_token        = ENV['ACCESS_TOKEN']
        config.access_token_secret = ENV['ACCESS_TOKEN_SECRET']
      end
      set :twitter_client, client
    end

    before do
      cache_control :no_cache
    end

    get '/' do
      File.read(File.join('public', 'index.html'))
    end

    get '/channels' do
      content_type :json
      Model::Ch2.all.to_json
    end

    get '/channels/current' do
      content_type :json
      settings.controller.channel.to_json
    end

    get '/programmes' do
      content_type :json
      begin
        t = Time.parse(params[:t])
      rescue
        t = Time.now
      end
      LiveStreamingTV::Model::Programme
        .joins('INNER JOIN channels ON programmes.channel = channels.channel_id')
        .joins('INNER JOIN ch2s ON channels.tp = ch2s.channel_number')
        .select('programmes.*, channels.tp, channels.display_name, ch2s.name, ch2s.remocon_number')
        .where('stop > ? AND stop < ?', t.beginning_of_hour, t.since(6.hours))
        .order('channels.service_id, programmes.start')
        .to_json
    end

    post '/channels/select' do
      ch = params[:ch].to_i
      settings.controller.channel(ch)
      200
    end

    post '/tweet' do
      img = params[:url].sub(/^data:image\/png;base64,/, '').unpack('m').first
      Tempfile.create("#{rand(256**16).to_s(16)}.png") do |png|
        open(png, 'wb') {|f| f.write img }
        open(png) do |f|
          settings.twitter_client.update_with_media(' ', f)
        end
      end
      201
    end
  end
end

